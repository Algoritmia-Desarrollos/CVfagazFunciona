import { supabase } from './supabaseClient.js';

// --- SELECTORES DE ELEMENTOS DEL DOM ---
const folderList = document.getElementById('folder-list');
const folderTitle = document.getElementById('folder-title');
const showAddFolderFormBtn = document.getElementById('show-add-folder-form-btn');
const addFolderForm = document.getElementById('add-folder-form');
const addFolderBtn = document.getElementById('add-folder-btn');
const cancelAddFolderBtn = document.getElementById('cancel-add-folder-btn');
const newFolderNameInput = document.getElementById('new-folder-name');
const parentFolderSelect = document.getElementById('parent-folder-select');
const uploadToFolderBtn = document.getElementById('upload-to-folder-btn');
const talentosListBody = document.getElementById('talentos-list-body');
const filtroInput = document.getElementById('filtro-candidatos');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const bulkActionsContainer = document.getElementById('bulk-actions-container');
const moveToFolderSelect = document.getElementById('move-to-folder-select');
const bulkMoveBtn = document.getElementById('bulk-move-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const textModalContainer = document.getElementById('text-modal-container');
const textModalTitle = document.getElementById('text-modal-title');
const textModalBody = document.getElementById('text-modal-body');
const textModalCloseBtn = document.getElementById('text-modal-close');
const tablePagination = document.getElementById('table-pagination');
const tablePageIndicator = document.getElementById('table-page-indicator');
const tablePrevPageBtn = document.getElementById('table-prev-page-btn');
const tableNextPageBtn = document.getElementById('table-next-page-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const loadedCountSpan = document.getElementById('loaded-count');
const totalCountSpan = document.getElementById('total-count');
const editModalContainer = document.getElementById('edit-modal-container');
const editModalCloseBtn = document.getElementById('edit-modal-close');
const editForm = document.getElementById('edit-form');
const editCandidateIdInput = document.getElementById('edit-candidate-id');
const editNombreInput = document.getElementById('edit-nombre');
const editEmailInput = document.getElementById('edit-email');
const editTelefonoInput = document.getElementById('edit-telefono');

// --- ESTADO GLOBAL DE LA APLICACIÓN ---
let candidatosCache = [];
let carpetasCache = [];
let currentFolderId = null;
let currentTablePage = 1;
const candidatesPerPage = 50;

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    if (!folderList || !talentosListBody) {
        console.error("Error crítico: No se encontraron los elementos base de la interfaz.");
        return;
    }
    await loadFolders();
    if (folderList.querySelector('.folder-item')) {
        folderList.querySelector('.folder-item').click();
    }
    if(textModalContainer) textModalContainer.addEventListener('click', (e) => { if (e.target === textModalContainer) closeTextModal(); });
    if(textModalCloseBtn) textModalCloseBtn.addEventListener('click', closeTextModal);

    showAddFolderFormBtn.addEventListener('click', () => toggleAddFolderForm(true));
    cancelAddFolderBtn.addEventListener('click', () => toggleAddFolderForm(false));
});

function toggleAddFolderForm(show) {
    if (show) {
        populateParentFolderSelect();
        addFolderForm.classList.remove('hidden');
        showAddFolderFormBtn.classList.add('hidden');
    } else {
        addFolderForm.classList.add('hidden');
        showAddFolderFormBtn.classList.remove('hidden');
        newFolderNameInput.value = '';
    }
}

// --- LÓGICA DE CARGA DE CANDIDATOS ---
async function loadCandidatesByFolder(folderId) {
    candidatosCache = [];
    currentTablePage = 1;
    talentosListBody.innerHTML = '';
    loadingIndicator.classList.remove('hidden');
    loadedCountSpan.textContent = '0';
    totalCountSpan.textContent = '...';
    handlePageChange();

    const folderIds = (folderId && folderId !== 'none') ? getAllSubfolderIds(Number(folderId)) : [];
    
    let countQuery = supabase.from('candidatos').select('id', { count: 'exact', head: true });
    if (folderId === 'none') {
        countQuery = countQuery.is('carpeta_id', null);
    } else if (folderId !== null) {
        countQuery = countQuery.in('carpeta_id', folderIds);
    }
    const { count, error: countError } = await countQuery;

    if (countError || count === 0) {
        loadingIndicator.classList.add('hidden');
        talentosListBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">${count === 0 ? 'No hay candidatos' : 'Error al contar'}</td></tr>`;
        return;
    }

    totalCountSpan.textContent = count;
    
    // Ahora hacemos una consulta directa en lugar de un RPC
    // ✨ CAMBIO: Se excluye la columna 'base64' para optimizar la carga inicial
    let query = supabase.from('candidatos').select('id, nombre_candidato, email, telefono, nombre_archivo, carpeta_id, texto_cv');
    if (folderId === 'none') {
        query = query.is('carpeta_id', null);
    } else if (folderId !== null) {
        query = query.in('carpeta_id', folderIds);
    }

    const { data, error } = await query
        .order('nombre_candidato', { ascending: true })
        .range(0, count -1); // Cargar todos de una vez, ya que el renderizado es progresivo

    if (error) {
        loadingIndicator.classList.add('hidden');
        talentosListBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Error al cargar candidatos.</td></tr>`;
        return;
    }

    candidatosCache = data;
    handlePageChange(); // Renderiza la primera página
    loadedCountSpan.textContent = candidatosCache.length;
    loadingIndicator.classList.add('hidden');
}

// --- MANEJO DE CARPETAS ---
async function loadFolders() {
    const { data, error } = await supabase.from('carpetas').select('*').order('nombre');
    if (error) { console.error("Error al cargar carpetas:", error); return; }
    carpetasCache = data;
    renderFolders();
    populateFolderSelect();
}

function renderFolders() {
    folderList.innerHTML = '';
    ['Todos los Candidatos', 'Sin Carpeta'].forEach(name => {
        const li = document.createElement('li');
        const id = name === 'Todos los Candidatos' ? null : 'none';
        li.innerHTML = createFolderHTML({ id, nombre: name }, false);
        const div = li.querySelector('.folder-item');
        div.addEventListener('click', () => handleFolderClick(id, name, div));
        if (id === 'none') addDropTarget(div);
        folderList.appendChild(li);
    });
    const topLevelFolders = carpetasCache.filter(f => f.parent_id === null);
    topLevelFolders.forEach(folder => folderList.appendChild(buildFolderTree(folder)));
}

function buildFolderTree(folder) {
    const children = carpetasCache.filter(f => f.parent_id === folder.id);
    const hasChildren = children.length > 0;
    const li = document.createElement('li');
    li.classList.add('folder-item-container');
    li.innerHTML = createFolderHTML(folder, hasChildren);
    const div = li.querySelector('.folder-item');
    div.addEventListener('click', (e) => {
        if (e.target.closest('.folder-item-actions') || e.target.classList.contains('toggle-icon')) return;
        handleFolderClick(folder.id, folder.nombre, div);
    });
    addDropTarget(div);
    div.draggable = true;
    div.addEventListener('dragstart', (e) => { e.stopPropagation(); e.dataTransfer.setData('text/folder-id', folder.id); div.classList.add('dragging'); });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    const editBtn = li.querySelector('.edit-folder-btn');
    const deleteBtn = li.querySelector('.delete-folder-btn');
    if(editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); editFolderName(folder.id, div); });
    if(deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteFolder(folder.id); });
    if (hasChildren) {
        const toggle = li.querySelector('.toggle-icon');
        const childrenUl = document.createElement('ul');
        childrenUl.classList.add('folder-item-container', 'collapsed');
        children.forEach(child => childrenUl.appendChild(buildFolderTree(child)));
        li.appendChild(childrenUl);
        toggle.addEventListener('click', (e) => { e.stopPropagation(); childrenUl.classList.toggle('collapsed'); toggle.classList.toggle('collapsed'); });
    }
    return li;
}

function createFolderHTML(folder, hasChildren) {
    let iconClass = 'fa-solid fa-folder';
    if (folder.id === null) iconClass = 'fa-solid fa-inbox';
    else if (folder.id === 'none') iconClass = 'fa-regular fa-folder-open';
    const toggleHTML = hasChildren ? `<i class="fa-solid fa-caret-right toggle-icon"></i>` : `<span class="toggle-icon"></span>`;
    const actionsHTML = (folder.id && folder.id !== 'none') ? `<div class="folder-item-actions"><button class="icon-btn edit-folder-btn" title="Editar nombre"><i class="fa-solid fa-pencil"></i></button><button class="icon-btn delete-folder-btn" title="Eliminar carpeta"><i class="fa-solid fa-trash-can"></i></button></div>` : '';
    return `<div class="folder-item" data-folder-id="${folder.id}">${toggleHTML}<i class="${iconClass}"></i><span class="folder-name">${folder.nombre}</span>${actionsHTML}</div>`;
}

function handleFolderClick(id, name, element) {
    currentFolderId = id;
    loadCandidatesByFolder(id);
    setActiveFolder(element);
    if(folderTitle) folderTitle.textContent = name;
    if(uploadToFolderBtn) uploadToFolderBtn.href = id ? `carga-masiva.html?folderId=${id}` : 'carga-masiva.html';
}

function setActiveFolder(selectedElement) {
    folderList.querySelectorAll('.folder-item.active').forEach(el => el.classList.remove('active'));
    if(selectedElement) selectedElement.classList.add('active');
}

addFolderBtn.addEventListener('click', async () => {
    const name = newFolderNameInput.value.trim();
    if (!name) {
        alert("Por favor, introduce un nombre para la carpeta.");
        return;
    }
    const parentId = parentFolderSelect.value ? parseInt(parentFolderSelect.value, 10) : null;

    const { error } = await supabase.from('carpetas').insert({ nombre: name, parent_id: parentId });
    
    if (error) {
        alert("Error al crear la carpeta.");
        console.error(error);
    } else {
        newFolderNameInput.value = '';
        toggleAddFolderForm(false);
        await loadFolders();
    }
});

async function editFolderName(folderId, folderDiv) {
    const nameSpan = folderDiv.querySelector('.folder-name');
    const currentName = nameSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.classList.add('folder-name-input');
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
    const saveChanges = async () => {
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
            await supabase.from('carpetas').update({ nombre: newName }).eq('id', folderId);
        }
        await loadFolders();
    };
    input.addEventListener('blur', saveChanges);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

async function deleteFolder(folderId) {
    const idsToDelete = getAllSubfolderIds(folderId);
    const { data: candidates, error } = await supabase.from('candidatos').select('id').in('carpeta_id', idsToDelete).limit(1);
    if (error || (candidates && candidates.length > 0)) {
        alert("No se puede eliminar la carpeta porque contiene candidatos. Mueva los candidatos a otra carpeta primero.");
        return;
    }
    if (confirm("¿Estás seguro de que quieres eliminar esta carpeta? Esta acción no se puede deshacer.")) {
        await supabase.from('carpetas').delete().eq('id', folderId);
        await loadFolders();
    }
}

// --- RENDERIZADO DE LA TABLA Y DEMÁS FUNCIONES ---
function renderTablePage(sourceData) {
    if(!talentosListBody) return;
    talentosListBody.innerHTML = '';
    const startIndex = (currentTablePage - 1) * candidatesPerPage;
    const paginatedItems = sourceData.slice(startIndex, startIndex + candidatesPerPage);
    renderTableRows(paginatedItems, false); // El 'false' indica reemplazar
    updateBulkActionsVisibility();
}

// Y modifica renderTableRows (o créala si no existe) así:
function renderTableRows(candidatos, append = false) {
    if (!append) talentosListBody.innerHTML = '';
    
    candidatos.forEach(candidato => {
        const row = document.createElement('tr');
        row.dataset.id = candidato.id;
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
            const checkbox = row.querySelector('.candidate-checkbox');
            const selectedIds = getSelectedCandidateIds();
            const payload = (checkbox && checkbox.checked && selectedIds.length > 0) ? selectedIds : [candidato.id];
            e.dataTransfer.setData('application/json', JSON.stringify(payload));
            document.querySelectorAll(`tr[data-id]`).forEach(r => { if(payload.includes(r.dataset.id)) r.classList.add('dragging'); });
        });
        row.addEventListener('dragend', () => document.querySelectorAll('tr.dragging').forEach(r => r.classList.remove('dragging')));
        
        row.addEventListener('click', (e) => {
            if (e.target.closest('a') || e.target.closest('button')) return;
            const checkbox = row.querySelector('.candidate-checkbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                const changeEvent = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(changeEvent);
            }
        });

        const carpeta = carpetasCache.find(c => c.id === candidato.carpeta_id);
        const folderName = carpeta ? carpeta.nombre : 'Sin Carpeta';

        row.innerHTML = `
            <td><input type="checkbox" class="candidate-checkbox" data-id="${candidato.id}"></td>
            <td><strong>${candidato.nombre_candidato || 'No extraído'}</strong><br><span class="text-light">${candidato.nombre_archivo || ''}</span></td>
            <td title="${folderName}">${folderName === 'Sin Carpeta' ? '<em>Sin Carpeta</em>' : folderName}</td>
            <td>${candidato.email || 'No extraído'}<br>${candidato.telefono || 'No extraído'}</td>
            <td class="actions-group">
                <button class="btn btn-secondary view-text-btn" data-id="${candidato.id}">Ver Texto</button>
                <button class="btn btn-primary download-cv-btn" data-id="${candidato.id}">Ver CV</button>
                <button class="icon-btn delete-candidate-btn" data-id="${candidato.id}"><i class="fa-solid fa-trash-can"></i></button>
                <button class="icon-btn edit-candidate-btn" data-id="${candidato.id}"><i class="fa-solid fa-pencil"></i></button>
            </td>
        `;
        addDropTarget(row);
        talentosListBody.appendChild(row);
    });
    addTableActionListeners();
}

// --- MODAL (POPUP) PARA VER TEXTO COMPLETO ---
function openTextModal(candidato) {
    if (!textModalContainer) return;
    textModalTitle.textContent = `Texto Completo de: ${candidato.nombre_candidato}`;
    textModalBody.innerHTML = `<pre>${candidato.texto_cv || 'No hay texto extraído para este candidato.'}</pre>`;
    textModalContainer.classList.remove('hidden');
    setTimeout(() => textModalContainer.classList.add('visible'), 10);
}

function closeTextModal() {
    if (!textModalContainer) return;
    textModalContainer.classList.remove('visible');
    setTimeout(() => textModalContainer.classList.add('hidden'), 300);
}

// Bloque a añadir
function addTableActionListeners() {
    talentosListBody.querySelectorAll('.view-text-btn:not(.listener-added)').forEach(btn => {
        btn.classList.add('listener-added');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const candidateId = e.target.closest('button').dataset.id;
            const candidato = candidatosCache.find(c => c.id == candidateId);
            if (candidato) openTextModal(candidato);
        });
    });

    talentosListBody.querySelectorAll('.download-cv-btn:not(.listener-added)').forEach(button => {
        button.classList.add('listener-added');
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.target.closest('button');
            const originalText = btn.textContent;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            const candidateId = btn.dataset.id;
            try {
                const { data, error } = await supabase
                    .from('candidatos')
                    .select('base64, nombre_archivo')
                    .eq('id', candidateId)
                    .single();

                if (error) throw error;

                const link = document.createElement('a');
                link.href = data.base64;
                link.download = data.nombre_archivo || 'cv.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

            } catch (err) {
                console.error("Error al descargar el CV:", err);
                alert("No se pudo descargar el CV.");
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });

    talentosListBody.querySelectorAll('.edit-candidate-btn:not(.listener-added)').forEach(btn => {
        btn.classList.add('listener-added');
        btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); });
    });
    talentosListBody.querySelectorAll('.delete-candidate-btn:not(.listener-added)').forEach(btn => {
        btn.classList.add('listener-added');
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteCandidate(btn.dataset.id); });
    });
}

function openEditModal(candidateId) {
    const candidato = candidatosCache.find(c => c.id == candidateId);
    if (!candidato) return;
    editCandidateIdInput.value = candidato.id;
    editNombreInput.value = candidato.nombre_candidato || '';
    editEmailInput.value = candidato.email || '';
    editTelefonoInput.value = candidato.telefono || '';
    editModalContainer.classList.remove('hidden');
    setTimeout(() => editModalContainer.classList.add('visible'), 10);
}

function closeEditModal() {
    editModalContainer.classList.remove('visible');
    setTimeout(() => editModalContainer.classList.add('hidden'), 300);
}

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editCandidateIdInput.value;
    const updatedData = {
        nombre_candidato: editNombreInput.value,
        email: editEmailInput.value,
        telefono: editTelefonoInput.value,
    };
    const { error } = await supabase.from('candidatos').update(updatedData).eq('id', id);
    if (error) {
        alert("Error al actualizar el candidato.");
    } else {
        closeEditModal();
        loadCandidatesByFolder(currentFolderId); // Recargar la vista
    }
});

async function deleteCandidate(candidateId) {
    if (confirm("¿Estás seguro de que quieres eliminar este candidato? Esta acción es permanente.")) {
        const { error } = await supabase.from('candidatos').delete().eq('id', candidateId);
        if (error) {
            alert("Error al eliminar el candidato.");
        } else {
            candidatosCache = candidatosCache.filter(c => c.id != candidateId);
            candidatosCache.sort((a, b) => (a.nombre_candidato || '').localeCompare(b.nombre_candidato || ''));
            handlePageChange();
        }
    }
}

// Listeners para el modal de edición
editModalCloseBtn.addEventListener('click', closeEditModal);
editModalContainer.addEventListener('click', (e) => { if (e.target === editModalContainer) closeEditModal(); });

// --- FUNCIONES AUXILIARES Y DE PAGINACIÓN ---
function getAllSubfolderIds(parentId) {
    let ids = [parentId];
    const children = carpetasCache.filter(f => f.parent_id === parentId);
    for (const child of children) { ids = ids.concat(getAllSubfolderIds(child.id)); }
    return ids;
}

function populateFolderSelect() {
    if(!moveToFolderSelect) return;
    moveToFolderSelect.innerHTML = '<option value="" disabled selected>Mover a...</option>';
    moveToFolderSelect.innerHTML += '<option value="none">Quitar de la carpeta</option>';
    function buildOptions(parentId = null, level = 0) {
        const prefix = '\u00A0\u00A0'.repeat(level);
        const folders = carpetasCache.filter(f => f.parent_id === parentId);
        folders.forEach(folder => {
            moveToFolderSelect.innerHTML += `<option value="${folder.id}">${prefix}${folder.nombre}</option>`;
            buildOptions(folder.id, level + 1);
        });
    }
    buildOptions();
}

function populateParentFolderSelect() {
    if (!parentFolderSelect) return;
    parentFolderSelect.innerHTML = '<option value="">Raíz (sin carpeta padre)</option>'; // Opción para carpeta raíz
    function buildOptions(parentId = null, level = 0) {
        const prefix = '\u00A0\u00A0'.repeat(level);
        const folders = carpetasCache.filter(f => f.parent_id === parentId);
        folders.forEach(folder => {
            parentFolderSelect.innerHTML += `<option value="${folder.id}">${prefix}${folder.nombre}</option>`;
            buildOptions(folder.id, level + 1);
        });
    }
    buildOptions();
}

function setupTablePagination(sourceData) {
    if (!tablePagination) return;
    const totalPages = Math.ceil(sourceData.length / candidatesPerPage);
    tablePagination.classList.toggle('hidden', totalPages <= 1);
    if(tablePageIndicator) tablePageIndicator.textContent = `Página ${currentTablePage} de ${totalPages}`;
    if(tablePrevPageBtn) tablePrevPageBtn.disabled = currentTablePage === 1;
    if(tableNextPageBtn) tableNextPageBtn.disabled = currentTablePage >= totalPages;
}

function addDropTarget(element) {
    element.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer.getData('text/folder-id') === element.dataset.folderId) return; element.classList.add('drag-over'); });
    element.addEventListener('dragleave', () => element.classList.remove('drag-over'));
    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');
        const candidateIds = e.dataTransfer.getData('application/json');
        const draggedFolderId = e.dataTransfer.getData('text/folder-id');
        if (draggedFolderId) {
            const targetFolderId = element.dataset.folderId === 'null' ? null : (element.dataset.folderId === 'none' ? null : element.dataset.folderId);
            if (targetFolderId && getAllSubfolderIds(Number(draggedFolderId)).includes(Number(targetFolderId))) {
                alert("No puedes mover una carpeta dentro de sí misma.");
                return;
            }
            await moveFolder(draggedFolderId, targetFolderId);
        } else if (candidateIds) {
            try {
                const parsedIds = JSON.parse(candidateIds);
                const targetFolderId = element.dataset.folderId === 'null' ? null : (element.dataset.folderId === 'none' ? null : element.dataset.folderId);
                await moveCandidatesToFolder(parsedIds, targetFolderId);
            } catch(error) { console.error("Drop de candidato fallido:", error); }
        }
    });
}

async function moveFolder(folderId, newParentId) {
    const { error } = await supabase.from('carpetas').update({ parent_id: newParentId }).eq('id', folderId);
    if (error) { alert("Error al mover la carpeta."); } else { await loadFolders(); }
}

async function moveCandidatesToFolder(candidateIds, folderId) {
    const { error } = await supabase.from('candidatos').update({ carpeta_id: folderId }).in('id', candidateIds);
    if (error) {
        alert("Error al mover candidatos.");
    } else {
        candidatosCache = candidatosCache.filter(c => !candidateIds.includes(c.id.toString()));
        candidatosCache.sort((a, b) => (a.nombre_candidato || '').localeCompare(b.nombre_candidato || ''));
        handlePageChange();
    }
}

function getSelectedCandidateIds() {
    return Array.from(document.querySelectorAll('.candidate-checkbox:checked')).map(cb => cb.dataset.id);
}

function updateBulkActionsVisibility() {
    if(bulkActionsContainer) bulkActionsContainer.classList.toggle('hidden', getSelectedCandidateIds().length === 0);
}

function handlePageChange() {
    const filteredData = getFilteredResults();
    renderTablePage(filteredData);
    setupTablePagination(filteredData);
}

function getFilteredResults() {
    if (!filtroInput) return candidatosCache;
    const termino = filtroInput.value.toLowerCase();
    if (!termino) return candidatosCache;
    return candidatosCache.filter(c => 
        (c.nombre_candidato || '').toLowerCase().includes(termino) ||
        (c.email || '').toLowerCase().includes(termino) ||
        (c.telefono || '').toLowerCase().includes(termino) ||
        (c.nombre_archivo || '').toLowerCase().includes(termino) ||
        (c.folder_path || '').toLowerCase().includes(termino) ||
        (c.resumen || '').toLowerCase().includes(termino)
    );
}

// --- LISTENERS FINALES ---
if (filtroInput) filtroInput.addEventListener('input', () => { currentTablePage = 1; handlePageChange(); });
if (talentosListBody) talentosListBody.addEventListener('change', (e) => {
    if (e.target.matches('.candidate-checkbox')) {
        updateBulkActionsVisibility();
    }
});
if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', () => {
    talentosListBody.querySelectorAll('.candidate-checkbox').forEach(cb => cb.checked = selectAllCheckbox.checked);
    const firstCheckbox = talentosListBody.querySelector('.candidate-checkbox');
    if (firstCheckbox) { firstCheckbox.dispatchEvent(new Event('change', { bubbles: true })); }
    else { updateBulkActionsVisibility(); }
});
if (bulkMoveBtn) bulkMoveBtn.addEventListener('click', async () => {
    const selectedIds = getSelectedCandidateIds();
    const targetFolderId = moveToFolderSelect.value === 'none' ? null : moveToFolderSelect.value;
    if (moveToFolderSelect.value === "" || selectedIds.length === 0) return;
    await moveCandidatesToFolder(selectedIds, targetFolderId);
});

if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', async () => {
    const selectedIds = getSelectedCandidateIds();
    if (selectedIds.length === 0) return;
    if (confirm(`¿Estás seguro de que quieres eliminar ${selectedIds.length} candidatos? Esta acción es permanente.`)) {
        await bulkDeleteCandidates(selectedIds);
    }
});

if(tablePrevPageBtn) tablePrevPageBtn.addEventListener('click', () => { if (currentTablePage > 1) { currentTablePage--; handlePageChange(); } });
if(tableNextPageBtn) tableNextPageBtn.addEventListener('click', () => { const totalPages = Math.ceil(getFilteredResults().length / candidatesPerPage); if (currentTablePage < totalPages) { currentTablePage++; handlePageChange(); } });

async function bulkDeleteCandidates(candidateIds) {
    const { error } = await supabase.from('candidatos').delete().in('id', candidateIds);
    if (error) {
        alert("Error al eliminar los candidatos.");
    } else {
        candidatosCache = candidatosCache.filter(c => !candidateIds.includes(c.id.toString()));
        candidatosCache.sort((a, b) => (a.nombre_candidato || '').localeCompare(b.nombre_candidato || ''));
        handlePageChange();
    }
}
