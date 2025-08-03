import { supabase } from './supabaseClient.js';
import { showSpinner, hideSpinner } from './utils.js';

const avisoListBody = document.getElementById('aviso-list-body');
let avisosCache = { avisos: [], candidatos: [] };

window.addEventListener('DOMContentLoaded', loadAvisos);

async function loadAvisos() {
    const CACHE_DURATION_MINUTES = 5;
    const now = Date.now();
    let isCacheValid = false;

    const cachedItem = localStorage.getItem('avisosCache');
    if (cachedItem) {
        try {
            const { data, timestamp } = JSON.parse(cachedItem);
            const ageMinutes = (now - timestamp) / (1000 * 60);

            if (ageMinutes < CACHE_DURATION_MINUTES) {
                avisosCache = data;
                renderizarTabla(avisosCache.avisos, avisosCache.candidatos);
                isCacheValid = true;
            } else {
                console.log("Caché de avisos expirado. Refrescando...");
            }
        } catch (e) {
            console.error("Error al parsear caché de avisos:", e);
            localStorage.removeItem('avisosCache');
        }
    }

    if (!isCacheValid) {
        showSpinner();
    }

    try {
        const [avisosRes, candidatosRes] = await Promise.all([
            supabase.from('avisos').select('*').order('created_at', { ascending: false }),
            supabase.from('candidatos').select('aviso_id')
        ]);

        if (avisosRes.error) throw avisosRes.error;
        if (candidatosRes.error) console.error("Error al cargar conteo de candidatos:", candidatosRes.error);

        const freshData = {
            avisos: avisosRes.data || [],
            candidatos: candidatosRes.data || []
        };

        if (JSON.stringify(avisosCache) !== JSON.stringify(freshData)) {
            avisosCache = freshData;
            renderizarTabla(freshData.avisos, freshData.candidatos);
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

function renderizarTabla(avisos, candidatos) {
    if (avisos.length === 0) {
        avisoListBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Aún no has creado ninguna búsqueda laboral.</td></tr>';
        return;
    }

    avisoListBody.innerHTML = '';

    const postulacionesMap = new Map();
    if (candidatos) {
        for (const candidato of candidatos) {
            if (candidato.aviso_id) {
                postulacionesMap.set(candidato.aviso_id, (postulacionesMap.get(candidato.aviso_id) || 0) + 1);
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
            <td>${postulacionesCount} / ${aviso.max_cv}</td>
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
