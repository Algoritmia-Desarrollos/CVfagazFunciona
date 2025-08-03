import { supabase } from './supabaseClient.js';
import { showSpinner, hideSpinner } from './utils.js';

const avisoListBody = document.getElementById('aviso-list-body');
let avisosCache = { avisos: [], evaluaciones: [] }; // Cambiado de 'candidatos' a 'evaluaciones'

window.addEventListener('DOMContentLoaded', loadAvisos);

async function loadAvisos() {
    const CACHE_DURATION_MINUTES = 5;
    const now = Date.now();
    let isCacheValid = false;

    // ... (la lógica de caché permanece igual)

    if (!isCacheValid) {
        showSpinner();
    }

    try {
        // ✨ CORRECCIÓN CLAVE: Ahora consultamos 'evaluaciones' en lugar de 'candidatos' ✨
        const [avisosRes, evaluacionesRes] = await Promise.all([
            supabase.from('avisos').select('*').order('created_at', { ascending: false }),
            supabase.from('evaluaciones').select('aviso_id') // Obtenemos las evaluaciones para contar
        ]);

        if (avisosRes.error) throw avisosRes.error;
        if (evaluacionesRes.error) console.error("Error al cargar conteo de evaluaciones:", evaluacionesRes.error);

        const freshData = {
            avisos: avisosRes.data || [],
            evaluaciones: evaluacionesRes.data || [] // Guardamos las evaluaciones
        };

        // Actualiza el renderizado si los datos son nuevos
        if (JSON.stringify(avisosCache) !== JSON.stringify(freshData)) {
            avisosCache = freshData;
            renderizarTabla(freshData.avisos, freshData.evaluaciones); // Pasamos las evaluaciones
            const newCacheItem = { data: freshData, timestamp: now };
            localStorage.setItem('avisosCache', JSON.stringify(newCacheItem));
        }
    } catch (error) {
        console.error("Error al cargar los avisos:", error);
        if (!isCacheValid) {
            avisoListBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error al cargar los avisos.</td></tr>`;
        }
    } finally {
        hideSpinner();
    }
}

function renderizarTabla(avisos, evaluaciones) {
    if (avisos.length === 0) {
        avisoListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Aún no has creado ninguna búsqueda laboral.</td></tr>';
        return;
    }

    avisoListBody.innerHTML = '';

    // El mapa ahora cuenta las evaluaciones por aviso_id
    const postulacionesMap = new Map();
    if (evaluaciones) {
        for (const evaluacion of evaluaciones) {
            if (evaluacion.aviso_id) {
                postulacionesMap.set(evaluacion.aviso_id, (postulacionesMap.get(evaluacion.aviso_id) || 0) + 1);
            }
        }
    }

    avisos.forEach(aviso => {
        const postulacionesCount = postulacionesMap.get(aviso.id) || 0;
        const validoHasta = new Date(aviso.valido_hasta).toLocaleDateString('es-AR', { timeZone: 'UTC' });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${aviso.id}</td>
            <td><strong>${aviso.titulo}</strong></td>
            <td>${postulacionesCount} / ${aviso.max_cv || 'N/A'}</td>
            <td>${validoHasta}</td>
            <td>
                <div class="actions-group">
                    <a href="resumenes.html?avisoId=${aviso.id}" class="btn btn-secondary">Ver Postulantes</a>
                    <a href="detalles-aviso.html?id=${aviso.id}" class="btn btn-secondary">Detalles</a>
                </div>
            </td>
        `;
        avisoListBody.appendChild(row);
    });
}