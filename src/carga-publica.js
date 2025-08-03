// Nombre del archivo: src/carga-publica.js
import { supabase } from './supabaseClient.js';

const fileInput = document.getElementById('fileInput');
const cvForm = document.getElementById('cv-form');
const submitBtn = document.getElementById('submit-btn');
const fileLabelText = document.getElementById('file-label-text');
const formView = document.getElementById('form-view');
const successView = document.getElementById('success-view');
const dropZone = document.getElementById('drop-zone');

let selectedFile = null;

// Configurar el worker para pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function handleFile(file) {
  if (file && file.type === 'application/pdf' && file.size <= 5 * 1024 * 1024) {
    selectedFile = file;
    fileLabelText.textContent = `Archivo seleccionado: ${selectedFile.name}`;
    submitBtn.disabled = false;
    dropZone.classList.remove('drag-over');
  } else {
    selectedFile = null;
    submitBtn.disabled = true;
    fileLabelText.textContent = 'Arrastra y suelta tu CV aquí o haz clic para seleccionar';
    if (file && file.type !== 'application/pdf') {
      alert("Por favor, selecciona un archivo en formato PDF.");
    } else if (file && file.size > 5 * 1024 * 1024) {
      alert("El archivo es demasiado grande. El tamaño máximo es de 5MB.");
    }
  }
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

cvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando CV...';

    try {
        const base64 = await fileToBase64(selectedFile);
        
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extrayendo texto...';
        const textoCV = await extraerTextoDePDF(base64);
        if (!textoCV || textoCV.trim().length < 50) {
            throw new Error("El contenido del PDF está vacío o no se pudo leer.");
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando...';
        const iaData = await extraerDatosConIA(textoCV);

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        await guardarCVEnBaseDeTalentos(selectedFile.name, base64, textoCV, iaData);
        
        formView.classList.add('hidden');
        successView.classList.remove('hidden');

    } catch (error) {
        console.error("Error en el proceso de carga:", error);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reintentar Envío';
        alert("No se pudo procesar el archivo. Por favor, inténtelo de nuevo. Si el problema persiste, comuníquese con nosotros para recibir asistencia.");
    }
});

async function guardarCVEnBaseDeTalentos(nombreArchivo, base64, textoCV, iaData) {
    const nuevoCandidato = {
      aviso_id: null,
      nombre_archivo: nombreArchivo,
      base64: base64,
      texto_cv: textoCV,
      nombre_candidato: iaData.nombreCompleto,
      email: iaData.email,
      telefono: iaData.telefono,
      resumen: 'Datos de contacto extraídos de la carga pública.', // Resumen genérico
      calificacion: null, // Sin calificación para carga pública
    };

    const { error } = await supabase.from('candidatos').insert(nuevoCandidato);

    if (error) {
        throw new Error(`Error al guardar en Supabase: ${error.message}`);
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
    } catch (error) { 
        console.warn("Fallo en extracción nativa, intentando con OCR.", error); 
    }
    // Fallback a OCR si la extracción nativa falla o es muy corta
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
    } catch (error) { 
        throw new Error("No se pudo leer el contenido del PDF ni con OCR."); 
    }
}

async function extraerDatosConIA(textoCV) {
    const textoCVOptimizado = textoCV.substring(0, 4000);
    const prompt = `
Actúa como un sistema experto de extracción de datos (Data Extraction Specialist). Tu única función es analizar el texto de un Curriculum Vitae (CV) y extraer con la máxima precisión tres datos específicos: nombre completo, email y teléfono. Debes ser metódico y seguir las siguientes reglas estrictas.

**Texto del CV a Analizar:**
"""${textoCVOptimizado}"""

---

**REGLAS DE EXTRACCIÓN DETALLADAS:**
1.  **nombreCompleto:** Busca el nombre más prominente. Ignora "Curriculum Vitae", "CV", etc. Intenta capturar nombre y al menos un apellido. Si no lo encuentras, usa null.
2.  **email:** Busca patrones claros de email con "@". Extrae solo la dirección. Si hay varios, elige el más profesional. Si no lo encuentras, usa null.
3.  **telefono:** Reconoce múltiples formatos. Prioriza números móviles. Si no lo encuentras, usa null.

---

**Formato de Salida Obligatorio (JSON estricto):**
Tu única respuesta debe ser un objeto JSON válido con exactamente estas tres claves: "nombreCompleto", "email", "telefono".
`;
    
    // Llamada a la Edge Function 'openai' que actúa como proxy seguro.
    const { data, error } = await supabase.functions.invoke('openai', {
        body: { query: prompt },
    });

    if (error) {
        throw new Error(`Error con la IA: ${error.message}`);
    }

    try {
        // La respuesta de la función de Supabase viene en 'data.message'
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
