import { supabase } from './supabaseClient.js';
import { showSpinner, hideSpinner } from './utils.js';

// --- SELECTORES ---
const avisoTitulo = document.getElementById('aviso-titulo');
const avisoDescripcion = document.getElementById('aviso-descripcion');
const necesariasList = document.getElementById('necesarias-list');
const deseablesList = document.getElementById('deseables-list');
const avisoIdSpan = document.getElementById('aviso-id');
const avisoMaxCvSpan = document.getElementById('aviso-max-cv');
const avisoValidoHastaSpan = document.getElementById('aviso-valido-hasta');
const linkPostulanteInput = document.getElementById('link-postulante');
const copiarLinkBtn = document.getElementById('copiar-link-btn');
const abrirLinkBtn = document.getElementById('abrir-link-btn');
const qrCanvas = document.getElementById('qr-canvas');

// --- SELECTORES PARA CARGA DE CANDIDATOS ---
const avisoSelector = document.getElementById('aviso-selector');
const loadFromAvisoBtn = document.getElementById('load-from-aviso-btn');
const folderSelector = document.getElementById('folder-selector');
const talentPoolContainer = document.getElementById('talent-pool-container');
const talentPoolList = document.getElementById('talent-pool-list');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const matchBtn = document.getElementById('match-btn');
const matchingStatus = document.getElementById('matching-status');


// --- ✨ NUEVOS SELECTORES PARA EL MODO EDICIÓN ✨ ---
const editAvisoBtn = document.getElementById('edit-aviso-btn');
const saveEditBtn = document.getElementById('save-edit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editTituloInput = document.getElementById('edit-titulo');
const editDescripcionTextarea = document.getElementById('edit-descripcion');
const editNecesariaInput = document.getElementById('edit-necesaria-input');
const editDeseableInput = document.getElementById('edit-deseable-input');
const addNecesariaBtn = document.getElementById('add-necesaria-btn');
const addDeseableBtn = document.getElementById('add-deseable-btn');
const editNecesariasList = document.getElementById('edit-necesarias-list');
const editDeseablesList = document.getElementById('edit-deseables-list');

let avisoActivo = null;
let condicionesNecesariasEdit = [];
let condicionesDeseablesEdit = [];
let currentTalentPool = [];

// --- LÓGICA PRINCIPAL ---
window.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const avisoId = params.get('id');

    if (!avisoId) {
        window.location.href = 'lista-avisos.html';
        return;
    }

    await loadAvisoDetails(avisoId);
    await loadOtherAvisos(avisoId);
    await loadFolders();

    // --- Listeners para Carga de Candidatos ---
    folderSelector.addEventListener('change', () => loadTalentPool(folderSelector.value));
    matchBtn.addEventListener('click', () => processSelectedCandidates(avisoId));
    selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = talentPoolList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
        matchBtn.disabled = !selectAllCheckbox.checked;
    });
    talentPoolList.addEventListener('change', (e) => {
        if (e.target.matches('input[type="checkbox"]')) {
            const checkedCheckboxes = talentPoolList.querySelectorAll('input[type="checkbox"]:checked');
            matchBtn.disabled = checkedCheckboxes.length === 0;
        }
    });


    // ✨ Listeners para los nuevos botones ✨
    editAvisoBtn.addEventListener('click', () => toggleEditMode(true));
    cancelEditBtn.addEventListener('click', () => toggleEditMode(false));
    saveEditBtn.addEventListener('click', guardarCambiosAviso);

    addNecesariaBtn.addEventListener('click', () => {
        if (editNecesariaInput.value.trim()) {
            condicionesNecesariasEdit.push(editNecesariaInput.value.trim());
            editNecesariaInput.value = '';
            renderizarCondicionesParaEdicion(editNecesariasList, condicionesNecesariasEdit, 'necesaria');
        }
    });
    addDeseableBtn.addEventListener('click', () => {
        if (editDeseableInput.value.trim()) {
            condicionesDeseablesEdit.push(editDeseableInput.value.trim());
            editDeseableInput.value = '';
            renderizarCondicionesParaEdicion(editDeseablesList, condicionesDeseablesEdit, 'deseable');
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            const tipo = e.target.dataset.tipo;
            if (tipo === 'necesaria') {
                condicionesNecesariasEdit.splice(index, 1);
                renderizarCondicionesParaEdicion(editNecesariasList, condicionesNecesariasEdit, 'necesaria');
            } else if (tipo === 'deseable') {
                condicionesDeseablesEdit.splice(index, 1);
                renderizarCondicionesParaEdicion(editDeseablesList, condicionesDeseablesEdit, 'deseable');
            }
        }
    });

    copiarLinkBtn.addEventListener('click', () => {
        linkPostulanteInput.select();
        document.execCommand('copy');
        alert('Link copiado al portapapeles');
    });
});

async function loadAvisoDetails(id) {
    showSpinner();
    const { data, error } = await supabase
        .from('avisos')
        .select('*')
        .eq('id', id)
        .single();
    hideSpinner();

    if (error) {
        console.error('Error fetching aviso:', error);
        avisoTitulo.textContent = 'Error al cargar el aviso';
        return;
    }

    avisoActivo = data;
    populateUI(avisoActivo);
}

function populateUI(aviso) {
    avisoTitulo.textContent = aviso.titulo;
    avisoDescripcion.textContent = aviso.descripcion;
    
    renderCondiciones(necesariasList, aviso.condiciones_necesarias);
    renderCondiciones(deseablesList, aviso.condiciones_deseables);

    avisoIdSpan.textContent = aviso.id;
    avisoMaxCvSpan.textContent = aviso.max_cvs || 'Ilimitados';
    avisoValidoHastaSpan.textContent = new Date(aviso.valido_hasta).toLocaleDateString();

    const publicLink = `${window.location.origin}/carga-publica.html?id=${aviso.id}`;
    linkPostulanteInput.value = publicLink;
    abrirLinkBtn.href = publicLink;

    new QRious({
        element: qrCanvas,
        value: publicLink,
        size: 150,
        background: 'white',
        foreground: 'black',
    });
}

function renderCondiciones(listElement, condiciones) {
    listElement.innerHTML = '';
    if (condiciones && condiciones.length > 0) {
        condiciones.forEach(condicion => {
            const li = document.createElement('li');
            li.textContent = condicion;
            listElement.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'No se especificaron condiciones.';
        li.style.color = 'var(--text-light)';
        listElement.appendChild(li);
    }
}

// --- LÓGICA PARA CARGAR CANDIDATOS ---

async function loadOtherAvisos(currentAvisoId) {
    const { data, error } = await supabase.from('avisos').select('id, titulo').neq('id', currentAvisoId);
    if (error) {
        console.error('Error loading other avisos:', error);
        return;
    }
    avisoSelector.innerHTML = '<option value="" disabled selected>Selecciona un aviso...</option>';
    data.forEach(aviso => {
        const option = document.createElement('option');
        option.value = aviso.id;
        option.textContent = aviso.titulo;
        avisoSelector.appendChild(option);
    });
}

async function loadFolders() {
    const { data: folders, error } = await supabase.from('carpetas').select('*').order('created_at');
    if (error) {
        console.error("Error cargando carpetas", error);
        return;
    }
    
    folderSelector.innerHTML = '<option value="" disabled selected>Selecciona una carpeta...</option>';
    // Función recursiva para mostrar la jerarquía de subcarpetas
    function populate(parentId = null, level = 0) {
        const prefix = '\u00A0\u00A0'.repeat(level);
        const children = folders.filter(f => f.parent_id === parentId);
        children.forEach(folder => {
            folderSelector.innerHTML += `<option value="${folder.id}">${prefix}${folder.nombre}</option>`;
            populate(folder.id, level + 1);
        });
    }
    populate();
}

async function loadTalentPool(folderId) {
    if (!folderId) {
        talentPoolContainer.classList.add('hidden');
        return;
    }
    showSpinner();
    const { data, error } = await supabase
        .from('candidatos')
        .select('id, nombre_candidato, texto_cv, aviso_id, base64, email')
        .eq('carpeta_id', folderId);
    hideSpinner();

    if (error) {
        console.error('Error loading talent pool:', error);
        return;
    }
    currentTalentPool = data;
    renderTalentPool(data);
    talentPoolContainer.classList.remove('hidden');
}

function renderTalentPool(candidatos) {
    talentPoolList.innerHTML = '';
    if (candidatos.length === 0) {
        talentPoolList.innerHTML = '<li class="empty-list">No hay candidatos en esta carpeta.</li>';
        return;
    }
    candidatos.forEach(candidato => {
        const li = document.createElement('li');
        li.className = 'talent-pool-item';
        li.innerHTML = `
            <input type="checkbox" id="candidato-${candidato.id}" data-id="${candidato.id}">
            <label for="candidato-${candidato.id}">${candidato.nombre_candidato} (${(candidato.texto_cv || '').substring(0, 50)}...)</label>
        `;
        talentPoolList.appendChild(li);
    });
}

async function processSelectedCandidates(targetAvisoId) {
    const selectedIds = Array.from(talentPoolList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.dataset.id));

    if (selectedIds.length === 0) {
        alert('Por favor, selecciona al menos un candidato.');
        return;
    }

    matchBtn.disabled = true;
    matchingStatus.textContent = `Procesando ${selectedIds.length} candidatos...`;
    matchingStatus.classList.remove('hidden');

    const selectedCandidatos = currentTalentPool.filter(c => selectedIds.includes(c.id));

    for (const candidato of selectedCandidatos) {
        try {
            const { error } = await supabase.functions.invoke('process-generic-cv', {
                body: {
                    record: candidato
                }
            });
            if (error) throw error;
        } catch (e) {
            console.error(`Error procesando al candidato ${candidato.nombre_candidato}:`, e);
        }
    }

    matchingStatus.textContent = `¡${selectedIds.length} candidatos enviados a análisis! Revisa la página de resúmenes.`;
    setTimeout(() => {
        matchingStatus.classList.add('hidden');
        matchBtn.disabled = false;
        talentPoolContainer.classList.add('hidden');
        folderSelector.value = '';
    }, 5000);
}


// --- ✨ NUEVAS FUNCIONES PARA MODO EDICIÓN ✨ ---

function toggleEditMode(isEditing) {
    const viewItems = document.querySelectorAll('.view-mode-item');
    const editItems = document.querySelectorAll('.edit-mode-item');

    if (isEditing) {
        if (!avisoActivo) return;
        // Pre-rellenar el formulario de edición con los datos actuales
        editTituloInput.value = avisoActivo.titulo;
        editDescripcionTextarea.value = avisoActivo.descripcion;
        condicionesNecesariasEdit = [...(avisoActivo.condiciones_necesarias || [])];
        condicionesDeseablesEdit = [...(avisoActivo.condiciones_deseables || [])];
        renderizarCondicionesParaEdicion(editNecesariasList, condicionesNecesariasEdit, 'necesaria');
        renderizarCondicionesParaEdicion(editDeseablesList, condicionesDeseablesEdit, 'deseable');

        viewItems.forEach(el => el.classList.add('hidden'));
        editItems.forEach(el => el.classList.remove('hidden'));
    } else {
        viewItems.forEach(el => el.classList.remove('hidden'));
        editItems.forEach(el => el.classList.add('hidden'));
    }
}

async function guardarCambiosAviso() {
    if (!avisoActivo) return;

    saveEditBtn.disabled = true;
    saveEditBtn.textContent = 'Guardando...';

    const datosActualizados = {
        titulo: editTituloInput.value,
        descripcion: editDescripcionTextarea.value,
        condiciones_necesarias: condicionesNecesariasEdit,
        condiciones_deseables: condicionesDeseablesEdit
    };

    const { data, error } = await supabase
        .from('avisos')
        .update(datosActualizados)
        .eq('id', avisoActivo.id)
        .select()
        .single();

    if (error) {
        alert("Error al guardar los cambios.");
        console.error(error);
    } else {
        avisoActivo = data; // Actualizar el aviso activo con los nuevos datos
        populateUI(avisoActivo); // Repoblar la vista estática
        toggleEditMode(false); // Volver al modo vista
    }

    saveEditBtn.disabled = false;
    saveEditBtn.textContent = 'Guardar Cambios';
}

function renderizarCondicionesParaEdicion(lista, array, tipo) {
    lista.innerHTML = '';
    array.forEach((condicion, index) => {
        const item = document.createElement('li');
        item.className = 'condition-item';
        item.innerHTML = `<span>${condicion}</span><button type="button" class="remove-btn" data-index="${index}" data-tipo="${tipo}">&times;</button>`;
        lista.appendChild(item);
    });
}
