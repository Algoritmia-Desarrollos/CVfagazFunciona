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
const avisoSelector = document.getElementById('aviso-selector');
const folderSelector = document.getElementById('folder-selector');
const talentPoolContainer = document.getElementById('talent-pool-container');
const talentPoolList = document.getElementById('talent-pool-list');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const matchBtn = document.getElementById('match-btn');
const matchingStatus = document.getElementById('matching-status');
const editAvisoBtn = document.getElementById('edit-aviso-btn');
const deleteAvisoBtn = document.getElementById('delete-aviso-btn');
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
const loadFromAvisoBtn = document.getElementById('load-from-aviso-btn');

let avisoActivo = null;
let condicionesNecesariasEdit = [];
let condicionesDeseablesEdit = [];
let currentTalentPool = [];

// --- LÓGICA PRINCIPAL (Listeners) ---
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

    // Listeners para Talent Pool
    folderSelector.addEventListener('change', () => loadTalentPool({ folderId: folderSelector.value }));
    loadFromAvisoBtn.addEventListener('click', () => loadTalentPool({ avisoId: avisoSelector.value }));
    matchBtn.addEventListener('click', processSelectedCandidates);
    selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = talentPoolList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
        updateMatchButtonState();
    });
    talentPoolList.addEventListener('change', () => updateMatchButtonState());

    // Listeners para Modo Edición
    editAvisoBtn.addEventListener('click', () => toggleEditMode(true));
    deleteAvisoBtn.addEventListener('click', deleteAviso);
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

    editNecesariasList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const index = e.target.dataset.index;
            condicionesNecesariasEdit.splice(index, 1);
            renderizarCondicionesParaEdicion(editNecesariasList, condicionesNecesariasEdit, 'necesaria');
        }
    });

    editDeseablesList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const index = e.target.dataset.index;
            condicionesDeseablesEdit.splice(index, 1);
            renderizarCondicionesParaEdicion(editDeseablesList, condicionesDeseablesEdit, 'deseable');
        }
    });
});

// --- CARGA DE DATOS INICIAL ---
async function loadAvisoDetails(id) {
    showSpinner();
    const { data, error } = await supabase.from('avisos').select('*').eq('id', id).single();
    hideSpinner();
    if (error) {
        console.error('Error loading aviso details:', error);
        document.body.innerHTML = '<p>Error al cargar el aviso. Por favor, vuelve a la <a href="lista-avisos.html">lista de avisos</a>.</p>';
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
    avisoMaxCvSpan.textContent = aviso.max_cv || 'Ilimitados';
    avisoValidoHastaSpan.textContent = new Date(aviso.valido_hasta).toLocaleDateString();

    const publicLink = `${window.location.origin}/index.html?avisoId=${aviso.id}`;
    linkPostulanteInput.value = publicLink;
    abrirLinkBtn.href = publicLink;

    copiarLinkBtn.addEventListener('click', () => {
        linkPostulanteInput.select();
        document.execCommand('copy');
        copiarLinkBtn.textContent = '¡Copiado!';
        setTimeout(() => {
            copiarLinkBtn.textContent = 'Copiar Link';
        }, 2000);
    });

    new QRious({
        element: qrCanvas,
        value: publicLink,
        size: 150
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

async function loadOtherAvisos(currentAvisoId) {
    const { data, error } = await supabase.from('avisos').select('id, titulo').not('id', 'eq', currentAvisoId);
    if (error) return console.error('Error loading other avisos:', error);
    
    avisoSelector.innerHTML = '<option value="" disabled selected>Selecciona un aviso...</option>';
    data.forEach(aviso => {
        avisoSelector.innerHTML += `<option value="${aviso.id}">${aviso.titulo}</option>`;
    });
}

async function loadFolders() {
    const { data: folders, error } = await supabase.from('carpetas').select('*').order('nombre', { ascending: true });
    if (error) return console.error('Error loading folders:', error);

    folderSelector.innerHTML = '<option value="" disabled selected>Selecciona una carpeta...</option>';
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

// --- LÓGICA DE TALENT POOL ---
async function loadTalentPool({ folderId, avisoId }) {
    if (!folderId && !avisoId) {
        talentPoolContainer.classList.add('hidden');
        return;
    }
    showSpinner();
    let finalData = [];
    let error = null;

    if (folderId) {
        const { data, error: folderError } = await supabase
            .from('candidatos')
            .select('id, nombre_candidato, email')
            .eq('carpeta_id', folderId);
        finalData = data;
        error = folderError;
    } else if (avisoId) {
        const { data, error: avisoError } = await supabase
            .from('evaluaciones')
            .select('candidatos(id, nombre_candidato, email)')
            .eq('aviso_id', avisoId);
        
        if (data) {
            finalData = data.map(item => item.candidatos).filter(Boolean);
        }
        error = avisoError;
    }

    hideSpinner();

    if (error) return console.error('Error loading talent pool:', error);

    currentTalentPool = finalData;
    renderTalentPool(finalData);
    talentPoolContainer.classList.remove('hidden');
}

function renderTalentPool(candidatos) {
    talentPoolList.innerHTML = '';
    if (!candidatos || candidatos.length === 0) {
        talentPoolList.innerHTML = '<li class="empty-list">No se encontraron candidatos.</li>';
        return;
    }
    candidatos.forEach(candidato => {
        const li = document.createElement('li');
        li.className = 'talent-pool-item';
        li.innerHTML = `
            <input type="checkbox" id="candidato-${candidato.id}" value="${candidato.id}">
            <label for="candidato-${candidato.id}">${candidato.nombre_candidato || 'Candidato sin nombre'} (${candidato.email || 'Sin email'})</label>
        `;
        talentPoolList.appendChild(li);
    });
    updateMatchButtonState();
}

function updateMatchButtonState() {
    const checkedCount = talentPoolList.querySelectorAll('input[type="checkbox"]:checked').length;
    matchBtn.disabled = checkedCount === 0;
}

async function processSelectedCandidates() {
    const seleccionadosIds = Array.from(talentPoolList.querySelectorAll('input[type="checkbox"]:checked'))
                               .map(input => parseInt(input.value, 10));

    if (seleccionadosIds.length === 0) return alert("Por favor, selecciona al menos un candidato.");
    if (!confirm(`¿Confirmas que quieres enviar a ${seleccionadosIds.length} candidato(s) para ser analizados?`)) return;

    matchBtn.disabled = true;
    matchBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creando Evaluaciones...`;
    
    try {
        const nuevasEvaluaciones = seleccionadosIds.map(candidatoId => ({
            candidato_id: candidatoId,
            aviso_id: avisoActivo.id
        }));

        const { error } = await supabase
            .from('evaluaciones')
            .upsert(nuevasEvaluaciones, { onConflict: 'candidato_id, aviso_id', ignoreDuplicates: true });

        if (error) throw error;

        matchingStatus.innerHTML = `<strong>¡Éxito!</strong> ${seleccionadosIds.length} candidato(s) enviados para análisis. Redirigiendo...`;
        matchingStatus.classList.remove('hidden');
        
        setTimeout(() => {
            window.location.href = `resumenes.html?avisoId=${avisoActivo.id}`;
        }, 3000);

    } catch (error) {
        console.error("Error al crear las evaluaciones:", error);
        matchingStatus.innerHTML = `<strong>Error:</strong> No se pudieron crear las evaluaciones. ${error.message}`;
        matchingStatus.classList.remove('hidden');
        matchBtn.disabled = false;
        matchBtn.innerHTML = `Reintentar Envío`;
    }
}

// --- LÓGICA DEL MODO EDICIÓN ---
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

async function deleteAviso() {
    if (!avisoActivo) return;

    const confirmation = confirm(`¿Estás seguro de que quieres eliminar el aviso "${avisoActivo.titulo}"? Esta acción no se puede deshacer.`);

    if (confirmation) {
        showSpinner();
        const { error } = await supabase
            .from('avisos')
            .delete()
            .eq('id', avisoActivo.id);
        hideSpinner();

        if (error) {
            alert('Error al eliminar el aviso.');
            console.error('Error deleting aviso:', error);
        } else {
            alert('Aviso eliminado correctamente.');
            window.location.href = 'lista-avisos.html';
        }
    }
}
