import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from "https://deno.land/x/openai/mod.ts";
// ✨ LIBRERÍA DE LECTURA DE PDF CAMBIADA POR UNA MÁS ESTÁNDAR Y ROBUSTA ✨
import pdf from 'https://esm.sh/pdf-parse@1.1.1';

// Cliente de Supabase con permisos de administrador
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Función para limpiar caracteres nulos
function cleanText(text: string): string {
  return text.replace(/\x00/g, '');
}

// Función principal que se ejecuta con el webhook
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const payload = await req.json();
    const cv = payload.record;

    // 1. Obtener datos del aviso para el contexto
    const { data: aviso, error: avisoError } = await supabaseAdmin
      .from('avisos')
      .select('*')
      .eq('id', cv.aviso_id)
      .single();
    if (avisoError) throw avisoError;

    // 2. Decodificar y extraer el texto del PDF
    const pdfBytes = atob(cv.base64.split(',')[1]);
    const buffer = new Uint8Array(pdfBytes.length);
    for (let i = 0; i < pdfBytes.length; i++) {
        buffer[i] = pdfBytes.charCodeAt(i);
    }
    
    // ✨ USANDO LA NUEVA LIBRERÍA PARA EXTRAER TEXTO ✨
    const pdfData = await pdf(buffer);
    const textoCV = cleanText(pdfData.text);


    if (!textoCV || textoCV.length < 50) {
      throw new Error("El contenido del PDF está vacío o no se pudo leer.");
    }
    
    // Guardar el texto extraído
    await supabaseAdmin.from('candidatos').update({ texto_cv: textoCV }).eq('id', cv.id);

    // 3. Preparar y llamar a la IA para el análisis
    const textoCVOptimizado = textoCV.substring(0, 12000);
    const contextoAviso = `
      - Puesto: ${aviso.titulo}
      - Descripción: ${aviso.descripcion}
      - Condiciones Necesarias (Excluyentes): ${aviso.condiciones_necesarias.join(', ') || 'No especificadas'}
      - Condiciones Deseables (Suman Puntos): ${aviso.condiciones_deseables.join(', ') || 'No especificadas'}
    `;

    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

    // (Aquí va tu prompt profesional completo)
    const prompt = `
    Actúa como un Headhunter y Especialista Senior en Reclutamiento y Selección para una consultora de alto nivel. Tu criterio es agudo, realista y orientado a resultados. Tu misión es realizar un análisis exhaustivo y profesional de un CV en relación con una búsqueda laboral específica, culminando en una calificación precisa y una justificación detallada.

    **Contexto de la Búsqueda (Job Description):**
    ${contextoAviso}

    **Texto del CV a Analizar:**
    """${textoCVOptimizado}"""

    ---

    **METODOLOGÍA DE EVALUACIÓN ESTRUCTURADA (SEGUIR ESTRICTAMENTE CADA PASO):**

    **PASO 1: Extracción de Datos Fundamentales.**
    Primero, identifica y extrae los siguientes datos clave del candidato. Si un dato no está presente, usa null.
    - nombreCompleto: Busca el nombre más prominente, usualmente al principio del documento. Ignora "Curriculum Vitae", "CV", "Nombre:", etc. Intenta capturar nombre y al menos un apellido.
    - email: Busca patrones claros de email con "@". Extrae solo la dirección. Si hay varios, elige el más profesional.
    - telefono: Reconoce múltiples formatos (con/sin prefijos +, guiones, espacios). Prioriza números móviles si hay varios.

    **PASO 2: Análisis de Relevancia y Coincidencia Directa (Filtro Crítico).**
    Este es el paso más importante. Antes de cualquier otra cosa, determina el grado de "match" directo entre el CV y el aviso.
    - Coincidencia de Puesto (ALTA PRIORIDAD): ¿Ha ocupado el candidato un puesto con un título idéntico o muy similar al del aviso? ¿Las funciones que describe en esa experiencia coinciden con la descripción del aviso? Una coincidencia fuerte aquí es el indicador más positivo y debe ser el factor principal de la calificación.
    - Análisis de Condiciones Necesarias (Excluyentes): Verifica metódica y literalmente cada una de las condiciones. Si el candidato NO CUMPLE ni siquiera una de estas condiciones, la calificación NO PUEDE superar los 40 puntos, sin importar qué otros méritos tenga. Este es un filtro no negociable. Si cumple todas, tiene una base sólida para una buena calificación.
    - Análisis de Condiciones Deseables (Suman Puntos): Revisa cuántas de estas condiciones cumple. Cada coincidencia no solo suma puntos, sino que refuerza la idoneidad del candidato.

    **PASO 3: Análisis Cualitativo del Perfil (Peso Secundario).**
    Una vez establecido el "match" técnico, evalúa la calidad del candidato.
    - Progresión y Estabilidad: ¿Muestra un crecimiento lógico en sus roles? ¿Su estabilidad laboral es coherente con el sector o presenta cambios demasiado frecuentes que puedan ser una señal de alerta?
    - Logros Cuantificables: ¿El candidato demuestra su impacto con datos y métricas (ej: "reduje costos en un 10%") o solo lista tareas? Los logros concretos son mucho más valiosos.
    - Habilidades y Tecnologías Adicionales: ¿Menciona herramientas, software o habilidades que, aunque no se pidieron, son claramente relevantes y valiosas para el puesto?

    **PASO 4: Sistema de Calificación Numérica (1-100).**
    Sintetiza tu análisis en un número, basándote en la siguiente escala de criterio:
    - 1-40 (Descartado): No cumple con una o más Condiciones Necesarias. O el perfil es de un campo completamente diferente.
    - 41-65 (Bajo Potencial): Cumple las condiciones necesarias "por los pelos", pero no tiene experiencia directa en el rol y carece de la mayoría de las deseables.
    - 66-85 (Sólido / Recomendado): Cumple TODAS las condiciones necesarias y varias de las deseables. Su experiencia laboral es muy similar o directamente transferible al puesto del aviso. Este es el rango para un buen candidato que encaja bien.
    - 86-100 (Excepcional / Prioritario): Cumple TODO lo necesario y la mayoría de lo deseable. Crucialmente, ya ha trabajado en un puesto idéntico o casi idéntico al del aviso, demostrando éxito y logros en él. Es un candidato ideal.

    **PASO 5: Elaboración de la Justificación Profesional.**
    Redacta un párrafo único y conciso que resuma tu dictamen. Estructúralo así:
    - Veredicto Inicial: Comienza con una afirmación clara sobre el nivel de "match" (Ej: "El candidato presenta un match directo y fuerte con la búsqueda..." o "El perfil no cumple con los requisitos excluyentes clave...").
    - Argumento Central: Justifica el veredicto mencionando explícitamente qué condiciones necesarias y deseables cumple o no. Destaca si tiene experiencia previa en el mismo rol.
    - Conclusión y Recomendación: Cierra con una síntesis que conecte el análisis con la nota y una recomendación clara (Ej: "...lo que resulta en una calificación de 88/100. Se recomienda una entrevista inmediata." o "...resultando en una calificación de 35/100 por no cumplir con el requisito de experiencia mínima. Se recomienda descartar.").

    **Formato de Salida (JSON estricto):**
    Devuelve un objeto JSON con 5 claves: "nombreCompleto", "email", "telefono", "calificacion" (número entero) y "justificacion" (el string de texto).
    `;

    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o-mini",
      response_format: { "type": "json_object" },
    });

    const iaResult = JSON.parse(chatCompletion.choices[0].message.content);

    // 4. Actualizar el candidato con los resultados
    const datosActualizados = {
      nombre_candidato: iaResult.nombreCompleto,
      email: iaResult.email,
      telefono: iaResult.telefono,
      calificacion: iaResult.calificacion,
      resumen: iaResult.justificacion
    };

    const { error: updateError } = await supabaseAdmin
      .from('candidatos')
      .update(datosActualizados)
      .eq('id', cv.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, message: `CV ${cv.id} procesado.` }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
      status: 200,
    });

  } catch (error) {
    console.error('Error en la función process-cv:', error);
    const payload = await req.json().catch(() => ({ record: {} }));
    if (payload.record?.id) {
        await supabaseAdmin
            .from('candidatos')
            .update({ calificacion: -1, resumen: error.message })
            .eq('id', payload.record.id);
    }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
      status: 500,
    });
  }
});
