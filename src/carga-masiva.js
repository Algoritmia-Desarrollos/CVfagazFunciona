import { supabase } from './supabaseClient.js';

// --- SELECTORES ---
const fileInput = document.getElementById('file-input-masivo');
const folderSelect = document.getElementById('folder-select-masivo');
const queueContainer = document.getElementById('upload-queue-container');
const queueList = document.getElementById('upload-queue-list');
const processQueueBtn = document.getElementById('process-queue-btn');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const linkPublicoInput = document.getElementById('link-publico');
const copiarLinkBtn = document.getElementById('copiar-link-btn');
const qrCanvas = document.getElementById('qr-canvas');

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const UPLOAD_QUEUE_KEY = 'uploadQueue';
let isProcessing = false;
let tempFileStore = {}; // Almacén en memoria para los objetos File

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    // Al cargar, los archivos en memoria se pierden. Marcar items pendientes como error.
    const queue = getQueue();
    let queueUpdated = false;
    queue.forEach(item => {
        if (item.status === 'pending' || item.status === 'processing') {
            item.status = 'error';
            item.error = 'La página se recargó. Por favor, añade el archivo de nuevo.';
            queueUpdated = true;
        }
    });
    if (queueUpdated) saveQueue(queue);

    await loadFoldersIntoSelect();
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('folderId');
    if (folderId) {
        folderSelect.value = folderId;
    }
    renderQueue();

    // Generar y mostrar el link público
    const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const link = `${window.location.origin}${path}/carga-publica.html`;

    if (linkPublicoInput) {
        linkPublicoInput.value = link;
    }

    if (qrCanvas) {
    new QRious({
        element: qrCanvas,
        value: link,
        size: 160, // <-- CAMBIA ESTE VALOR
        background: 'white',
        foreground: '#334155'
    });
    }

    if (copiarLinkBtn) {
        copiarLinkBtn.addEventListener('click', () => {
            linkPublicoInput.select();
            document.execCommand('copy');
            const originalText = copiarLinkBtn.innerHTML;
            copiarLinkBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
            setTimeout(() => { copiarLinkBtn.innerHTML = originalText; }, 2000);
        });
    }
});

async function loadFoldersIntoSelect() {
    const { data: folders, error } = await supabase.from('carpetas').select('*').order('created_at');
    if (error) {
        console.error("Error cargando carpetas", error);
        return;
    }
    
    // Función recursiva para mostrar la jerarquía de subcarpetas
    function populate(parentId = null, level = 0) {
        const prefix = '\u00A0\u00A0'.repeat(level);
        const children = folders.filter(f => f.parent_id === parentId);
        children.forEach(folder => {
            folderSelect.innerHTML += `<option value="${folder.id}">${prefix}${folder.nombre}</option>`;
            populate(folder.id, level + 1);
        });
    }
    populate();
}

// --- MANEJO DE LA COLA DE CARGA ---
fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const queue = getQueue();
    const newQueueItems = [];

    for (const file of files) {
        // Evitar duplicados en la cola actual
        if (queue.some(item => item.fileName === file.name) || newQueueItems.some(item => item.fileName === file.name)) {
            console.warn(`Archivo duplicado omitido: ${file.name}`);
            continue;
        }
        
        const id = `file-${Date.now()}-${Math.random()}`;
        // Guardar el objeto File en el almacén temporal en memoria
        tempFileStore[id] = file;
        
        // Añadir solo metadatos a la cola que va a localStorage
        newQueueItems.push({
            id: id,
            fileName: file.name,
            status: 'pending',
            error: null
        });
    }

    if (newQueueItems.length > 0) {
        const updatedQueue = [...queue, ...newQueueItems];
        saveQueue(updatedQueue);
        renderQueue();
    }

    // Resetear el input para poder seleccionar los mismos archivos otra vez si es necesario
    fileInput.value = '';
});

function getQueue() { return JSON.parse(localStorage.getItem(UPLOAD_QUEUE_KEY) || '[]'); }
function saveQueue(queue) { localStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue)); }

function renderQueue() {
    const queue = getQueue();
    // La cola siempre está visible, solo cambia su contenido
    if (queue.length === 0) {
        queueList.innerHTML = '<li class="queue-item-empty">La cola de carga está vacía. Selecciona archivos para comenzar.</li>';
    } else {
        queueList.innerHTML = '';
        queue.forEach(item => {
            const li = document.createElement('li');
            li.className = `queue-item status-${item.status}`;
            li.dataset.id = item.id;
            li.innerHTML = `
                <span class="file-name">${item.fileName}</span>
                <span class="status-badge">${item.status}</span>
            `;
            if (item.status === 'error' && item.error) {
                const errorMsg = document.createElement('span');
                errorMsg.className = 'error-message';
                errorMsg.textContent = item.error;
                li.appendChild(errorMsg);
            }
            queueList.appendChild(li);
        });
    }

    const hasPending = queue.some(item => item.status === 'pending' || item.status === 'error');
    const btnText = processQueueBtn.querySelector('span');
    btnText.textContent = hasPending ? 'Iniciar/Reanudar Carga' : 'Carga Completa';
    processQueueBtn.disabled = !hasPending || isProcessing;
}

function addTempQueueItem(id, fileName) {
     const li = document.createElement('li');
     li.className = 'queue-item status-processing';
     li.dataset.id = id;
     li.innerHTML = `<span class="file-name">${fileName}</span><span class="status-badge">Añadiendo...</span>`;
     queueList.appendChild(li);
}

function removeTempQueueItem(id) {
    const tempItem = queueList.querySelector(`[data-id="${id}"]`);
    if (tempItem) tempItem.remove();
}

// --- PROCESAMIENTO DE LA COLA ---
processQueueBtn.addEventListener('click', () => {
    if (isProcessing) return;
    processQueue();
});

async function processQueue() {
    isProcessing = true;
    renderQueue();

    const CONCURRENT_LIMIT = 3;
    const selectedFolderId = folderSelect.value === "none" ? null : (folderSelect.value || null);

    while (true) {
        let queue = getQueue();
        const itemsToProcess = queue.filter(item => item.status === 'pending').slice(0, CONCURRENT_LIMIT);

        if (itemsToProcess.length === 0) break;

        const promises = itemsToProcess.map(async (item) => {
            // Marcar como 'processing'
            item.status = 'processing';
            item.error = null;
            saveQueue(getQueue().map(q => q.id === item.id ? item : q));
            updateQueueItemUI(item.id, 'processing');
            
            try {
                const file = tempFileStore[item.id];
                if (!file) throw new Error("Archivo no encontrado en memoria. Por favor, recargue y seleccione de nuevo.");

                const base64 = await fileToBase64(file);
                const textoCV = await extraerTextoDePDF(base64);
                if (!textoCV || textoCV.trim().length < 50) throw new Error("PDF vacío o ilegible.");
                
                const iaData = await extraerDatosConIA(textoCV);
                const nuevoCandidato = {
                    nombre_archivo: item.fileName,
                    base64: base64,
                    texto_cv: textoCV,
                    nombre_candidato: iaData.nombreCompleto,
                    email: iaData.email,
                    telefono: iaData.telefono,
                    carpeta_id: selectedFolderId,
                    resumen: null,
                    calificacion: null,
                    aviso_id: null
                };

                const { error } = await supabase.from('candidatos').insert(nuevoCandidato);
                if (error) throw new Error(error.message);
                
                item.status = 'success';
                delete tempFileStore[item.id]; // Limpiar de la memoria
            } catch (error) {
                item.status = 'error';
                item.error = error.message;
            }
            
            // Actualizar el item final en la cola de localStorage
            let finalQueue = getQueue();
            const finalItem = finalQueue.find(q => q.id === item.id);
            if (finalItem) {
                finalItem.status = item.status;
                finalItem.error = item.error;
            }
            saveQueue(finalQueue);
            updateQueueItemUI(item.id, item.status, item.error);
        });

        await Promise.all(promises);
    }

    isProcessing = false;
    localStorage.removeItem('talentPoolCache');
    renderQueue();
}

function updateQueueItemUI(id, status, errorMsg = null) {
    const li = queueList.querySelector(`[data-id="${id}"]`);
    if (!li) return;
    li.className = `queue-item status-${status}`;
    li.querySelector('.status-badge').textContent = status;

    // Limpiar elementos de UI antiguos (mensaje de error, enlace de descarga)
    const existingError = li.querySelector('.error-message');
    if (existingError) existingError.remove();
    const existingLink = li.querySelector('.download-link');
    if (existingLink) existingLink.remove();

    if (status === 'error') {
        if (errorMsg) {
            const errorSpan = document.createElement('span');
            errorSpan.className = 'error-message';
            errorSpan.textContent = errorMsg;
            li.appendChild(errorSpan);
        }
        
        // Añadir enlace de descarga si el archivo está disponible en memoria
        const file = tempFileStore[id];
        if (file) {
            try {
                const downloadLink = document.createElement('a');
                downloadLink.className = 'download-link';
                downloadLink.href = URL.createObjectURL(file);
                downloadLink.textContent = 'Descargar PDF para revisión';
                downloadLink.download = file.name;
                downloadLink.style.marginLeft = '10px';
                downloadLink.style.color = '#007bff';
                li.appendChild(downloadLink);
            } catch (e) {
                console.error("Error creando el enlace de descarga:", e);
            }
        }
    }
}

clearQueueBtn.addEventListener('click', () => {
    let queue = getQueue();
    // ✨ LÓGICA CORREGIDA: Mantiene solo los que están pendientes o en proceso ✨
    queue = queue.filter(item => item.status === 'pending' || item.status === 'processing');
    saveQueue(queue);
    renderQueue();
});

// --- FUNCIONES AUXILIARES (Tu lógica de extracción que funciona) ---
async function extraerTextoDePDF(base64) {
    const pdf = await pdfjsLib.getDocument(base64).promise;
    let textoFinal = '';
    try {
        let textoNativo = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textoNativo += textContent.items.map(item => item.str).join(' ');
        }
        textoNativo = textoNativo.trim();
        if (textoNativo.length > 100) return textoNativo;
    } catch (error) { console.warn("Fallo en extracción nativa, intentando con OCR.", error); }
    try {
        let textoOCR = '';
        const canvas = document.createElement('canvas');
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); 
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const result = await Tesseract.recognize(canvas, 'spa');
            textoOCR += `\n--- Página ${i} ---\n${result.data.text}`;
        }
        return textoOCR;
    } catch (error) { throw new Error("No se pudo leer el contenido del PDF."); }
}

async function extraerDatosConIA(textoCV) {
    const textoCVOptimizado = textoCV.substring(0, 4000);
    const prompt = `
Actúa como un sistema experto de extracción de datos (Data Extraction Specialist). Tu única función es analizar el texto de un Curriculum Vitae (CV) y extraer con la máxima precisión tres datos específicos: nombre completo, email y teléfono. Debes ser metódico y seguir las siguientes reglas estrictas para manejar todas las posibles variaciones y formatos.
**Texto del CV a Analizar:**
"""${textoCVOptimizado}"""
---
**REGLAS DE EXTRACCIÓN DETALLADAS:**
**1. Para "nombreCompleto":**
   - **Prioridad:** Busca el nombre más prominente, usualmente al principio del documento.
   - **Exclusiones:** Ignora palabras como "Curriculum Vitae", "CV", "Nombre:", "Apellido:", así como títulos profesionales como "Lic.", "Ing.", "Dr.".
   - **Composición:** Intenta capturar al menos un nombre y un apellido. Si hay múltiples apellidos o nombres, inclúyelos.
   - **Caso de Falla:** Si después de un análisis exhaustivo no puedes determinar un nombre con certeza, devuelve \`null\`.
**2. Para "email":**
   - **Identificación:** Busca patrones claros de email que contengan "@" y un dominio (ej: ".com", ".net", ".com.ar").
   - **Limpieza:** Extrae únicamente la dirección de correo. Ignora prefijos como "Email:", "Correo:", "Contacto:" o íconos.
   - **Múltiples Emails:** Si encuentras varias direcciones de correo, prioriza la que parezca más profesional (ej: "nombre.apellido@dominio.com" sobre "supergato99@hotmail.com"). Si no puedes decidir, devuelve la primera que encuentres.
   - **Caso de Falla:** Si no hay ninguna dirección de correo válida, devuelve \`null\`.
**3. Para "telefono":**
   - **Formatos Válidos:** Reconoce una amplia gama de formatos, incluyendo:
     - Números locales: (0341) 155-123456, 3415123456, 444-5566
     - Números internacionales con prefijos: +54 9 341 5123456, +5493415123456
     - Números con o sin paréntesis, guiones o espacios.
   - **Limpieza:** Extrae la secuencia de números completa, incluyendo el código de área y país si están presentes. Elimina cualquier texto como "Tel:", "Móvil:", "Celular:", "WhatsApp:".
   - **Múltiples Teléfonos:** Si encuentras varios números (ej: un fijo y un móvil), prioriza el número móvil (generalmente más largo o con prefijos como "15" o "+54 9"). Si no puedes distinguir, devuelve el primero que encuentres.
   - **Caso de Falla:** Si no encuentras una secuencia numérica que claramente sea un teléfono, devuelve \`null\`.
---
**Formato de Salida Obligatorio (JSON estricto):**
Tu única respuesta debe ser un objeto JSON válido con exactamente estas tres claves. No incluyas explicaciones, saludos ni texto adicional fuera del JSON.
**Ejemplo de salida esperada:**
{
  "nombreCompleto": "Juan Ignacio Pérez García",
  "email": "juan.perez.g@example.com",
  "telefono": "+5491112345678"
}
`;
    
    const { data, error } = await supabase.functions.invoke('openai', {
        body: { query: prompt },
    });

    if (error) {
        throw new Error(`Error con la IA: ${error.message}`);
    }

    try {
        const content = JSON.parse(data.message);
        return {
            nombreCompleto: content.nombreCompleto || null,
            email: content.email || null,
            telefono: content.telefono || null,
        };
    } catch (e) {
        console.error("Error al parsear la respuesta de la IA:", data.message, e);
        throw new Error("La IA devolvió una respuesta con formato inesperado.");
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
