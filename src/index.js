// Se importa el cliente de Supabase.
import { supabase } from './supabaseClient.js';

// --- SELECTORES (Sin cambios) ---
const fileInput = document.getElementById('fileInput');
const cvForm = document.getElementById('cv-form');
const submitBtn = document.getElementById('submit-btn');
const fileLabelText = document.getElementById('file-label-text');
const formView = document.getElementById('form-view');
const successView = document.getElementById('success-view');
const avisoContainer = document.getElementById('aviso-container');
const uploadSection = document.getElementById('upload-section');
const dropZone = document.getElementById('drop-zone');

let avisoActivo = null;

// --- Lógica para mostrar el aviso (Sin cambios) ---
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const avisoId = parseInt(urlParams.get('avisoId'), 10);

    if (!avisoId) {
        avisoContainer.innerHTML = '<h1>Link de postulación inválido.</h1>';
        uploadSection.classList.add('hidden');
        return;
    }
    
    const { data: aviso, error } = await supabase
        .from('avisos')
        .select('*')
        .eq('id', avisoId)
        .single();

    if (error || !aviso) {
        console.error("Error al buscar el aviso:", error);
        avisoContainer.innerHTML = '<h1>Esta búsqueda laboral no fue encontrada.</h1>';
        uploadSection.classList.add('hidden');
        return;
    }
    
    avisoActivo = aviso;
    avisoContainer.innerHTML = `<h1>Postúlate para: ${avisoActivo.titulo}</h1>`;
});

// --- Lógica de subida de archivo (Sin cambios) ---
let selectedFile = null;

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

// --- Lógica de envío del formulario (Sin cambios) ---
cvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile || !avisoActivo) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    const reader = new FileReader();
    reader.onload = async function () {
        const base64 = reader.result;
        try {
            await guardarCVEnSupabase(selectedFile.name, base64, avisoActivo.id);
            formView.classList.add('hidden');
            successView.classList.remove('hidden');
        } catch (error) {
            console.error("Error al guardar en Supabase:", error);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Error al Enviar';
            alert(`Hubo un problema al enviar tu postulación: ${error.message}`);
        }
    };
    reader.readAsDataURL(selectedFile);
});

/**
 * Guarda un nuevo candidato y crea la evaluación correspondiente.
 */
async function guardarCVEnSupabase(nombre, base64, avisoId) {
    // 1. Insertar en la tabla 'candidatos'
    const candidatoData = {
        nombre_archivo: nombre,
        base64: base64,
    };

    const { data: nuevoCandidato, error: candidatoError } = await supabase
        .from('candidatos')
        .insert(candidatoData)
        .select()
        .single();

    if (candidatoError) {
        console.error("Error al insertar candidato:", candidatoError);
        throw new Error(candidatoError.message);
    }

    // 2. Insertar en la tabla 'evaluaciones' usando el ID del candidato recién creado
    const evaluacionData = {
        candidato_id: nuevoCandidato.id,
        aviso_id: avisoId,
    };

    const { error: evaluacionError } = await supabase
        .from('evaluaciones')
        .insert(evaluacionData);

    if (evaluacionError) {
        // Si falla la creación de la evaluación, es buena idea eliminar el candidato para no dejar datos huérfanos.
        console.error("Error al crear evaluación, revirtiendo inserción de candidato:", evaluacionError);
        await supabase.from('candidatos').delete().eq('id', nuevoCandidato.id);
        throw new Error(evaluacionError.message);
    }
}
