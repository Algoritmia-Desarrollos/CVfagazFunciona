// Se importa el cliente de Supabase.
import { supabase } from './supabaseClient.js';
import { showSpinner, hideSpinner } from './utils.js';


// --- SELECTORES Y CONSTANTES GLOBALES ---
const resumenesList = document.getElementById('resumenes-list');
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalCloseBtn = document.getElementById('modal-close');
const panelTitle = document.getElementById('panel-title');
const processingStatus = document.getElementById('processing-status');
const filtroContainer = document.getElementById('filtro-container');
const filtroNombre = document.getElementById('filtro-nombre');
const modalSaveNotesBtn = document.getElementById('modal-save-notes');
const modalCancelBtn = document.getElementById('modal-cancel');
// ✨ NUEVOS SELECTORES PARA CARGA DIRECTA ✨
const uploadCvBtn = document.getElementById('upload-cv-btn');
const fileInputResumenes = document.getElementById('file-input-resumenes');


pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let archivosCache = [];
let avisoActivo = null;

// --- LÓGICA PRINCIPAL ---
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const avisoId = parseInt(urlParams.get('avisoId'), 10);

    if (!avisoId) {
        panelTitle.textContent = 'Error';
        resumenesList.innerHTML = '<tr><td colspan="6">No se ha especificado una búsqueda.</td></tr>';
        return;
    }

    try {
        avisoActivo = await getAvisoById(avisoId);
        panelTitle.textContent = `Candidatos para: ${avisoActivo.titulo}`;
        await cargarYProcesarCandidatos(avisoId);
    } catch (error) {
        console.error("Error al cargar datos iniciales:", error);
        panelTitle.textContent = 'Error de Carga';
        resumenesList.innerHTML = `<tr><td colspan="6">No se pudo cargar el aviso.</td></tr>`;
    }
});

async function cargarYProcesarCandidatos(avisoId) {
    processingStatus.classList.remove('hidden');
    
    const candidatos = await getCandidatosByAvisoId(avisoId);
    archivosCache = candidatos;

    if (candidatos.length === 0) {
        processingStatus.textContent = "Aún no hay candidatos para esta búsqueda.";
        resumenesList.innerHTML = `<tr><td colspan="6" style="text-align: center;">Nadie se ha postulado todavía.</td></tr>`;
    } else {
        actualizarVistaCandidatos();
    }
    
    filtroContainer.classList.remove('hidden');

    const nuevosCandidatos = candidatos.filter(cv => cv.calificacion === null || cv.calificacion === -1);
    
    if (nuevosCandidatos.length > 0) {
        processingStatus.textContent = `Analizando ${nuevosCandidatos.length} nuevos CVs...`;
        
        for (const [index, cv] of nuevosCandidatos.entries()) {
            processingStatus.textContent = `Procesando ${index + 1} de ${nuevosCandidatos.length}... (${cv.nombre_archivo})`;
            
            if (cv.calificacion === -1) {
                cv.calificacion = null;
                actualizarFilaEnVista(cv.id);
            }

            try {
                const textoCV = cv.texto_cv || await extraerTextoDePDF(cv.base64);
                
                if (!textoCV || textoCV.trim().length < 50) {
                    throw new Error("El PDF parece estar vacío o no se pudo leer el contenido.");
                }

                const iaData = await calificarCVConIA(textoCV, avisoActivo);
                
                const datosActualizados = {
                    texto_cv: textoCV,
                    nombre_candidato: iaData.nombreCompleto,
                    email: iaData.email,
                    telefono: iaData.telefono,
                    calificacion: iaData.calificacion,
                    resumen: iaData.justificacion
                };
                
                await actualizarCandidatoEnDB(cv.id, datosActualizados);
                Object.assign(cv, datosActualizados);
                
            } catch (error) {
                console.error(`Falló el procesamiento para el CV ${cv.id}:`, error);
                const datosError = {
                    calificacion: -1,
                    resumen: `Error de análisis: ${error.message}`
                };
                await actualizarCandidatoEnDB(cv.id, datosError);
                Object.assign(cv, datosError);
            }
            actualizarFilaEnVista(cv.id);
        }
        processingStatus.textContent = "Análisis completado.";
    } else {
        processingStatus.textContent = "Todos los candidatos están calificados.";
    }
}

// =================================================================================
// ✨ LÓGICA AÑADIDA PARA CARGA DIRECTA DE CVs ✨
// =================================================================================
if (uploadCvBtn) {
    uploadCvBtn.addEventListener('click', () => {
        fileInputResumenes.click();
    });
}

if (fileInputResumenes) {
    fileInputResumenes.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length || !avisoActivo) return;

        uploadCvBtn.disabled = true;
        
        processingStatus.textContent = `Agregando ${files.length} nuevo(s) CV(s) a la lista de análisis...`;
        
        for (const file of files) {
            try {
                const base64 = await fileToBase64(file);
                const nuevoCandidato = {
                    aviso_id: avisoActivo.id,
                    nombre_archivo: file.name,
                    base64: base64,
                    calificacion: null
                };
                
                const { data, error } = await supabase.from('candidatos').insert(nuevoCandidato).select().single();
                if (error) throw error;
                
                archivosCache.unshift(data);
                actualizarVistaCandidatos();

            } catch (error) {
                console.error(`Error al subir el archivo ${file.name}:`, error);
                alert(`No se pudo subir el archivo: ${file.name}`);
            }
        }

        await cargarYProcesarCandidatos(avisoActivo.id);
        uploadCvBtn.disabled = false;
        fileInputResumenes.value = '';
    });
}


function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}


// --- FUNCIONES DE BASE DE DATOS (SUPABASE) ---
async function getAvisoById(id) {
    const { data, error } = await supabase.from('avisos').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

async function getCandidatosByAvisoId(avisoId) {
    const { data, error } = await supabase.from('candidatos').select('*').eq('aviso_id', avisoId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

async function actualizarCandidatoEnDB(candidatoId, datos) {
    const { error } = await supabase.from('candidatos').update(datos).eq('id', candidatoId);
    if (error) throw error;
}

async function extraerTextoDePDF(base64) {
    const pdf = await pdfjsLib.getDocument(base64).promise;
    try {
        let textoNativo = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textoNativo += textContent.items.map(item => item.str).join(' ');
        }
        textoNativo = textoNativo.trim().replace(/\x00/g, '');
        if (textoNativo.length > 100) return textoNativo;
    } catch (error) {
        console.warn("Fallo en extracción nativa, intentando OCR.", error);
    }
    console.log("Recurriendo a OCR...");
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
        return textoOCR.replace(/\x00/g, '');
    } catch (error) {
        throw new Error("No se pudo leer el contenido del PDF.");
    }
}

async function calificarCVConIA(textoCV, aviso) {
    const textoCVOptimizado = textoCV.substring(0, 12000);
    const contextoAviso = `
- **Puesto:** ${aviso.titulo}
- **Descripción:** ${aviso.descripcion}
- **Condiciones Necesarias (Excluyentes):** ${aviso.condiciones_necesarias.join(', ') || 'No especificadas'}
- **Condiciones Deseables (Suman Puntos):** ${aviso.condiciones_deseables.join(', ') || 'No especificadas'}
`;
    const prompt = `
Actúa como un Headhunter y Especialista Senior en Reclutamiento y Selección para una consultora de alto nivel. Tu criterio es agudo, realista y orientado a resultados. Tu misión es realizar un análisis exhaustivo y profesional de un CV en relación con una búsqueda laboral específica, culminando en una calificación precisa y una justificación detallada.

**Contexto de la Búsqueda (Job Description):**
${contextoAviso}

**Texto del CV a Analizar:**
"""${textoCVOptimizado}"""

---

**METODOLOGÍA DE EVALUACIÓN ESTRUCTURADA (SEGUIR ESTRICTAMENTE CADA PASO):**

**PASO 1: Extracción de Datos Fundamentales.**
Primero, identifica y extrae los siguientes datos clave del candidato. Si un dato no está presente, usa \`null\`.
- **nombreCompleto:** Busca el nombre más prominente, usualmente al principio del documento. Ignora "Curriculum Vitae", "CV", "Nombre:", etc. Intenta capturar nombre y al menos un apellido.
- **email:** Busca patrones claros de email con "@". Extrae solo la dirección. Si hay varios, elige el más profesional.
- **telefono:** Reconoce múltiples formatos (con/sin prefijos +, guiones, espacios). Prioriza números móviles si hay varios.

**PASO 2: Análisis de Relevancia y Coincidencia Directa (Filtro Crítico).**
Este es el paso más importante. Antes de cualquier otra cosa, determina el grado de "match" directo entre el CV y el aviso.

**Coincidencia de Puesto (ALTA PRIORIDAD):** ¿Ha ocupado el candidato un puesto con un título idéntico o muy similar al del aviso? ¿Las funciones que describe en esa experiencia coinciden con la descripción del aviso? Una coincidencia fuerte aquí es el indicador más positivo y debe ser el factor principal de la calificación.

**Análisis de Condiciones Necesarias (Excluyentes):** Verifica metódica y literalmente cada una de las condiciones.

Si el candidato NO CUMPLE ni siquiera una de estas condiciones, la calificación NO PUEDE superar los 40 puntos, sin importar qué otros méritos tenga. Este es un filtro no negociable.

Si cumple todas, tiene una base sólida para una buena calificación.

**Análisis de Condiciones Deseables (Suman Puntos):** Revisa cuántas de estas condiciones cumple. Cada coincidencia no solo suma puntos, sino que refuerza la idoneidad del candidato.

**PASO 3: Análisis Cualitativo del Perfil (Peso Secundario).**
Una vez establecido el "match" técnico, evalúa la calidad del candidato.

**Progresión y Estabilidad:** ¿Muestra un crecimiento lógico en sus roles? ¿Su estabilidad laboral es coherente con el sector o presenta cambios demasiado frecuentes que puedan ser una señal de alerta?

**Logros Cuantificables:** ¿El candidato demuestra su impacto con datos y métricas (ej: "reduje costos en un 10%") o solo lista tareas? Los logros concretos son mucho más valiosos.

**Habilidades y Tecnologías Adicionales:** ¿Menciona herramientas, software o habilidades que, aunque no se pidieron, son claramente relevantes y valiosas para el puesto?

**PASO 4: Sistema de Calificación Numérica (1-100).**
Sintetiza tu análisis en un número, basándote en la siguiente escala de criterio:

**1-40 (Descartado):** No cumple con una o más Condiciones Necesarias. O el perfil es de un campo completamente diferente.

**41-65 (Bajo Potencial):** Cumple las condiciones necesarias "por los pelos", pero no tiene experiencia directa en el rol y carece de la mayoría de las deseables.

**66-85 (Sólido / Recomendado):** Cumple TODAS las condiciones necesarias y varias de las deseables. Su experiencia laboral es muy similar o directamente transferible al puesto del aviso. Este es el rango para un buen candidato que encaja bien.

**86-100 (Excepcional / Prioritario):** Cumple TODO lo necesario y la mayoría de lo deseable. Crucialmente, ya ha trabajado en un puesto idéntico o casi idéntico al del aviso, demostrando éxito y logros en él. Es un candidato ideal.

**PASO 5: Elaboración de la Justificación Profesional.**
Redacta un párrafo único y conciso que resuma tu dictamen. Estructúralo así:

**Veredicto Inicial:** Comienza con una afirmación clara sobre el nivel de "match" (Ej: "El candidato presenta un match directo y fuerte con la búsqueda..." o "El perfil no cumple con los requisitos excluyentes clave...").

**Argumento Central:** Justifica el veredicto mencionando explícitamente qué condiciones necesarias y deseables cumple o no. Destaca si tiene experiencia previa en el mismo rol.

**Conclusión y Recomendación:** Cierra con una síntesis que conecte el análisis con la nota y una recomendación clara (Ej: "...lo que resulta en una calificación de 88/100. Se recomienda una entrevista inmediata." o "...resultando en una calificación de 35/100 por no cumplir con el requisito de experiencia mínima. Se recomienda descartar.").

**Formato de Salida (JSON estricto):**
Devuelve un objeto JSON con 5 claves: "nombreCompleto", "email", "telefono", "calificacion" (número entero) y "justificacion" (el string de texto).
`;
    const { data, error } = await supabase.functions.invoke('openai', { body: { query: prompt } });
    if (error) throw new Error("No se pudo conectar con la IA.");
    try {
        const content = JSON.parse(data.message);
        return {
            nombreCompleto: content.nombreCompleto || 'No especificado',
            email: content.email || 'No especificado',
            telefono: content.telefono || 'No especificado',
            calificacion: content.calificacion === undefined ? 0 : content.calificacion,
            justificacion: content.justificacion || "La IA no pudo generar una justificación."
        };
    } catch (e) {
        throw new Error("La IA devolvió una respuesta con un formato inesperado.");
    }
}

function actualizarVistaCandidatos() {
    const filtro = filtroNombre.value.toLowerCase();
    const candidatosFiltrados = archivosCache.filter(cv => {
        const nombreCandidato = (cv.nombre_candidato || '').toLowerCase();
        const nombreArchivo = (cv.nombre_archivo || '').toLowerCase();
        return nombreCandidato.includes(filtro) || nombreArchivo.includes(filtro);
    });
    candidatosFiltrados.sort((a, b) => {
        const scoreA = (typeof a.calificacion === 'number' ? a.calificacion : -1);
        const scoreB = (typeof b.calificacion === 'number' ? b.calificacion : -1);
        return scoreB - scoreA;
    });
    resumenesList.innerHTML = '';
    if (candidatosFiltrados.length === 0) {
        resumenesList.innerHTML = '<tr><td colspan="6" style="text-align: center;">No se encontraron candidatos.</td></tr>';
    } else {
        candidatosFiltrados.forEach(cv => renderizarFila(cv, true));
    }
}

function actualizarFilaEnVista(cvId) {
    const cv = archivosCache.find(c => c.id === cvId);
    if (cv) {
        renderizarFila(cv, false);
    }
}

function renderizarFila(cv, esNueva) {
    let calificacionMostrada;
    if (cv.calificacion === null) {
        calificacionMostrada = '<em>Analizando...</em>';
    } else if (cv.calificacion === -1) {
        calificacionMostrada = `<strong style="color: var(--danger-color);">Error</strong>`;
    } else if (typeof cv.calificacion === 'number') {
        calificacionMostrada = `<strong>${cv.calificacion} / 100</strong>`;
    }
    const notasClass = cv.notas ? 'has-notes' : '';
    const rowHTML = `
        <td>${cv.nombre_archivo || 'N/A'}</td>
        <td><strong>${cv.nombre_candidato || 'No extraído'}</strong></td>
        <td>${calificacionMostrada}</td>
        <td><button class="btn btn-secondary" data-action="ver-resumen" ${cv.calificacion === null || cv.calificacion === -1 ? 'disabled' : ''}>Análisis IA</button></td>
        <td><button class="btn btn-secondary ${notasClass}" data-action="ver-notas">Notas</button></td>
        <td>
            <div class="actions-group">
                <a href="${cv.base64}" download="${cv.nombre_archivo}" class="btn btn-primary">Ver CV</a>
                <button class="btn btn-secondary" data-action="ver-contacto" ${cv.calificacion === null || cv.calificacion === -1 ? 'disabled' : ''}>Contacto</button>
            </div>
        </td>
    `;
    if (esNueva) {
        const newRow = document.createElement('tr');
        newRow.dataset.id = cv.id;
        newRow.innerHTML = rowHTML;
        resumenesList.appendChild(newRow);
    } else {
        const existingRow = resumenesList.querySelector(`tr[data-id='${cv.id}']`);
        if (existingRow) {
            existingRow.innerHTML = rowHTML;
        }
    }
}
filtroNombre.addEventListener('input', actualizarVistaCandidatos);

resumenesList.addEventListener('click', (e) => {
    const button = e.target.closest('.btn');
    if (!button) return;
    const row = e.target.closest('tr');
    if (!row) return;
    const cvId = parseInt(row.dataset.id, 10);
    const action = button.dataset.action;
    const cv = archivosCache.find(c => c.id === cvId);
    if (!cv) return;
    switch (action) {
        case 'ver-resumen': abrirModalResumen(cv); break;
        case 'ver-contacto': abrirModalContacto(cv); break;
        case 'ver-notas': abrirModalNotas(cv); break;
    }
});

function abrirModalResumen(cv) {
    modalTitle.textContent = `Análisis de ${cv.nombre_candidato || 'Candidato'}`;
    let bodyContent = `<h4>Calificación: ${typeof cv.calificacion === 'number' ? cv.calificacion + '/100' : cv.calificacion}</h4><p>${cv.resumen ? cv.resumen.replace(/\n/g, '<br>') : 'No hay análisis disponible.'}</p>`;
    modalBody.innerHTML = bodyContent;
    modalSaveNotesBtn.classList.add('hidden');
    abrirModal();
}

function abrirModalContacto(cv) {
    modalTitle.textContent = `Contacto de ${cv.nombre_candidato || 'Candidato'}`;
    modalBody.innerHTML = `<ul><li><strong>Nombre:</strong> ${cv.nombre_candidato || 'No extraído'}</li><li><strong>Email:</strong> ${cv.email || 'No extraído'}</li><li><strong>Teléfono:</strong> ${cv.telefono || 'No extraído'}</li></ul>`;
    modalSaveNotesBtn.classList.add('hidden');
    abrirModal();
}

async function abrirModalNotas(cv) {
    modalTitle.textContent = `Notas sobre ${cv.nombre_candidato || 'Candidato'}`;
    modalBody.innerHTML = `<textarea id="notas-textarea" placeholder="Escribe tus notas aquí...">${cv.notas || ''}</textarea>`;
    modalSaveNotesBtn.classList.remove('hidden');
    modalSaveNotesBtn.onclick = async () => {
        const nuevasNotas = document.getElementById('notas-textarea').value;
        try {
            await actualizarCandidatoEnDB(cv.id, { notas: nuevasNotas });
            const candidatoCache = archivosCache.find(c => c.id === cv.id);
            candidatoCache.notas = nuevasNotas;
            cerrarModal();
            actualizarFilaEnVista(cv.id);
        } catch (error) {
            alert("No se pudieron guardar las notas.");
        }
    };
    abrirModal();
}

modalCloseBtn.addEventListener('click', cerrarModal);
modalCancelBtn.addEventListener('click', cerrarModal);
modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) {
        cerrarModal();
    }
});

function abrirModal() {
    modalContainer.classList.remove('hidden');
    setTimeout(() => modalContainer.classList.add('visible'), 10);
}

function cerrarModal() {
    modalContainer.classList.remove('visible');
    setTimeout(() => {
        modalContainer.classList.add('hidden');
        modalBody.innerHTML = '';
    }, 300);
}