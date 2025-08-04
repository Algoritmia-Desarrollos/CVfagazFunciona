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

   **METODOLOGÍA DE EVALUACIÓN ESTRUCTURADA Y SISTEMA DE PUNTUACIÓN (SEGUIR ESTRICTAMENTE):**

**PASO 1: Extracción de Datos Fundamentales.**
Primero, extrae los siguientes datos clave. Si un dato no está presente, usa null.
-   nombreCompleto: El nombre más prominente del candidato.
-   email: El correo electrónico más profesional que encuentres.
-   telefono: El número de teléfono principal, priorizando móviles.

**PASO 2: Sistema de Calificación Ponderado (Puntuación de 0 a 100).**
Calcularás la nota final siguiendo este sistema de puntos que refleja las prioridades del reclutador.

**A. FILTRO CRÍTICO: Condiciones Necesarias (Ponderación: Máxima - Regla de Knock-Out)**
   - Verifica metódica y literalmente CADA UNA de las "Condiciones Necesarias".
   - **SI EL CANDIDATO NO CUMPLE CON ABSOLUTAMENTE TODAS las condiciones, el proceso se detiene aquí.** Asigna una calificación final entre **1 y 40 puntos** y en la justificación explica claramente cuál requisito excluyente faltó.
   - **SI CUMPLE CON TODAS**, el candidato "aprueba" este filtro y se le otorga una **base de 50 puntos**. Continúa al siguiente paso para sumar puntos adicionales.

**B. ANÁLISIS SECUNDARIO: Condiciones Deseables (Ponderación: Alta - hasta 25 Puntos Adicionales)**
   - Si el candidato aprobó el Paso A, ahora evalúa las "Condiciones Deseables".
   - Por CADA condición deseable que el candidato cumpla, suma la cantidad de puntos correspondiente (**25 Puntos / Total de Condiciones Deseables**). Sé estricto; si solo cumple parcialmente, otorga la mitad de los puntos para esa condición.

**C. ANÁLISIS DE EXPERIENCIA: Match con la Descripción (Ponderación: Media - hasta 25 Puntos Adicionales)**
   - Evalúa la calidad y relevancia de la experiencia laboral del candidato en relación con la descripción del puesto.
   - **Coincidencia de Rol y Funciones (hasta 15 puntos):** ¿La experiencia es en un puesto con un título y funciones idénticos o muy similares al del aviso? Un match perfecto (mismo rol, mismas tareas) otorga los 15 puntos. Un match parcial (rol diferente pero con tareas transferibles) otorga entre 5 y 10 puntos.
   - **Calidad del Perfil (hasta 10 puntos):** Evalúa la calidad general del CV. ¿Muestra una progresión de carrera lógica? ¿Es estable laboralmente? ¿Presenta logros cuantificables (ej: "aumenté ventas 15%") en lugar de solo listar tareas? Un CV con logros claros y buena estabilidad obtiene más puntos.

**PASO 3: Elaboración de la Justificación Profesional.**
Redacta un párrafo único y conciso que resuma tu dictamen, justificando la nota final basándote en el sistema de puntos.
   - **Veredicto Inicial:** Comienza con una afirmación clara. Si fue descartado, indícalo (Ej: "Perfil descartado por no cumplir con el requisito excluyente de..."). Si aprobó, describe el nivel de "match" (Ej: "El candidato presenta un perfil muy competitivo...").
   - **Argumento Central:** Justifica la nota mencionando explícitamente los puntos obtenidos. (Ej: "Cumple con todas las condiciones necesarias (Base 50 pts), cumple 2 de 3 condiciones deseables (+16.6 pts) y su experiencia tiene un match fuerte con la descripción (+12 pts)...").
   - **Conclusión y Recomendación:** Cierra con la nota final calculada y una recomendación clara. (Ej: "...resultando en una calificación final de 79/100. Se recomienda una entrevista." o "...resultando en una calificación de 35/100. Se recomienda descartar.").

**Formato de Salida (JSON estricto):**
Devuelve un objeto JSON con 5 claves: "nombreCompleto", "email", "telefono", "calificacion" (el número entero final calculado) y "justificacion" (el string de texto).
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
