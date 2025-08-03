import { supabase } from './supabaseClient.js';

// --- SELECTORES ---
const generarDescripcionBtn = document.getElementById('generar-descripcion-btn');
const puestoInput = document.getElementById('puesto-trabajo');
const descripcionTextarea = document.getElementById('descripcion-trabajo');
const avisoForm = document.getElementById('aviso-form');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message'); // Asumiendo que existe un div para errores
const necesariaInput = document.getElementById('necesaria-input');
const deseableInput = document.getElementById('deseable-input');
const addNecesariaBtn = document.getElementById('add-necesaria-btn');
const addDeseableBtn = document.getElementById('add-deseable-btn');
const necesariasList = document.getElementById('necesarias-list');
const deseablesList = document.getElementById('deseables-list');

let condicionesNecesarias = [];
let condicionesDeseables = [];

// Bloque de código a añadir
async function generarDescripcionConIA() {
    const puesto = puestoInput.value.trim();
    if (!puesto) {
        alert("Por favor, primero escribe un título para el puesto.");
        return;
    }

    // Mostrar estado de carga en el botón
    generarDescripcionBtn.disabled = true;
    generarDescripcionBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generando...`;

    // Prompt detallado para la IA
    const prompt = `
    Actúa como un experto en Recursos Humanos y redactor de ofertas de empleo. Tu tarea es crear el contenido completo para una nueva búsqueda laboral basándote únicamente en el título del puesto proporcionado.

    **Título del Puesto:**
    """${puesto}"""

    ---

    **TAREAS A REALIZAR:**
    1.  **descripcion:** Redacta un párrafo atractivo y profesional (entre 80 y 150 palabras) que describa las responsabilidades clave del puesto y lo que la empresa ofrece. Utiliza un tono profesional y acogedor.
    2.  **condiciones_necesarias:** Genera una lista de 3 a 5 requisitos que son absolutamente esenciales para el puesto (habilidades técnicas, experiencia mínima, certificaciones, etc.). Deben ser frases cortas y claras.
    3.  **condiciones_deseables:** Genera una lista de 2 a 4 requisitos que no son esenciales pero que sumarían muchos puntos al perfil del candidato (habilidades blandas, conocimientos en software secundario, etc.).

    ---

    **Formato de Salida Obligatorio (JSON estricto):**
    Tu única respuesta debe ser un objeto JSON válido con exactamente estas tres claves: "descripcion", "condiciones_necesarias" (un array de strings), y "condiciones_deseables" (un array de strings). No incluyas explicaciones ni texto adicional fuera del JSON.

    **Ejemplo de salida esperada:**
    {
      "descripcion": "Estamos en búsqueda de un/a Desarrollador/a Full Stack con experiencia para unirse a nuestro equipo de innovación. Serás responsable del ciclo completo de desarrollo de nuevas funcionalidades, desde el diseño hasta la implementación, trabajando con tecnologías de vanguardia para crear soluciones robustas y escalables. Ofrecemos un excelente ambiente laboral, oportunidades de crecimiento y flexibilidad.",
      "condiciones_necesarias": ["Más de 3 años de experiencia en desarrollo web", "Sólidos conocimientos en JavaScript, React y Node.js", "Experiencia con bases de datos SQL y NoSQL", "Manejo de sistemas de control de versiones (Git)"],
      "condiciones_deseables": ["Conocimientos de TypeScript", "Experiencia en metodologías ágiles (Scrum)", "Familiaridad con servicios en la nube (AWS, Azure)", "Habilidades de comunicación efectiva"]
    }
    `;

    try {
        const { data, error } = await supabase.functions.invoke('openai', {
            body: { query: prompt },
        });

        if (error) throw error;

        const iaResult = JSON.parse(data.message);

        // Rellenar los campos del formulario con la respuesta
        descripcionTextarea.value = iaResult.descripcion;
        condicionesNecesarias = iaResult.condiciones_necesarias || [];
        condicionesDeseables = iaResult.condiciones_deseables || [];

        // Actualizar la vista de las listas de condiciones
        renderizarCondiciones(necesariasList, condicionesNecesarias, 'necesaria');
        renderizarCondiciones(deseablesList, condicionesDeseables, 'deseable');

    } catch (error) {
        console.error("Error al generar con IA:", error);
        alert("Hubo un error al contactar con la IA. Por favor, inténtalo de nuevo.");
    } finally {
        // Restaurar el botón
        generarDescripcionBtn.disabled = false;
        generarDescripcionBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generar con IA`;
    }
}

// --- Lógica de la interfaz ---
function renderizarCondiciones(lista, array, tipo) {
    lista.innerHTML = '';
    array.forEach((condicion, index) => {
        const item = document.createElement('li');
        item.className = 'condition-item';
        item.innerHTML = `<span>${condicion}</span><button type="button" class="remove-btn" data-index="${index}" data-tipo="${tipo}">&times;</button>`;
        lista.appendChild(item);
    });
}

addNecesariaBtn.addEventListener('click', () => {
    if (necesariaInput.value.trim()) {
        condicionesNecesarias.push(necesariaInput.value.trim());
        necesariaInput.value = '';
        renderizarCondiciones(necesariasList, condicionesNecesarias, 'necesaria');
    }
});

addDeseableBtn.addEventListener('click', () => {
    if (deseableInput.value.trim()) {
        condicionesDeseables.push(deseableInput.value.trim());
        deseableInput.value = '';
        renderizarCondiciones(deseablesList, condicionesDeseables, 'deseable');
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn')) {
        const index = parseInt(e.target.dataset.index, 10);
        const tipo = e.target.dataset.tipo;
        if (tipo === 'necesaria') {
            condicionesNecesarias.splice(index, 1);
            renderizarCondiciones(necesariasList, condicionesNecesarias, 'necesaria');
        } else if (tipo === 'deseable') {
            condicionesDeseables.splice(index, 1);
            renderizarCondiciones(deseablesList, condicionesDeseables, 'deseable');
        }
    }
});

// Bloque a añadir
generarDescripcionBtn.addEventListener('click', generarDescripcionConIA);

avisoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    
    // Ocultar mensajes previos
    successMessage.classList.add('hidden');
    if (errorMessage) errorMessage.classList.add('hidden');

    submitButton.disabled = true;
    submitButton.textContent = 'Guardando...';

    const nuevoAviso = {
        // El ID es generado automáticamente por Supabase (PostgreSQL)
        titulo: document.getElementById('puesto-trabajo').value,
        descripcion: document.getElementById('descripcion-trabajo').value,
        max_cv: parseInt(document.getElementById('max-cv').value, 10),
        valido_hasta: document.getElementById('valido-hasta').value,
        condiciones_necesarias: condicionesNecesarias,
        condiciones_deseables: condicionesDeseables
    };

    const { error } = await supabase.from('avisos').insert(nuevoAviso);

    if (error) {
        console.error('Error al guardar el aviso:', error);
        if (errorMessage) {
            errorMessage.textContent = `Error al guardar: ${error.message}`;
            errorMessage.classList.remove('hidden');
        } else {
            alert('Hubo un error al guardar el aviso.');
        }
        submitButton.disabled = false;
        submitButton.textContent = 'Guardar y Publicar';
        return;
    }

    // Limpiar caché para que la lista de avisos se actualice
    localStorage.removeItem('avisosCache');

    successMessage.classList.remove('hidden');
    
    // Resetear el formulario y estado
    avisoForm.reset();
    condicionesNecesarias = [];
    condicionesDeseables = [];
    renderizarCondiciones(necesariasList, [], 'necesaria');
    renderizarCondiciones(deseablesList, [], 'deseable');
    
    // Redirigir a la lista de avisos después de 3 segundos
    setTimeout(() => {
        window.location.href = 'lista-avisos.html';
    }, 3000);
});
