// Ruta del archivo: supabase/functions/process-generic-cv/index.ts

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from "https://deno.land/x/openai/mod.ts";
import pdf from 'https://esm.sh/pdf-parse@1.1.1';

// Cliente de Supabase con permisos de administrador
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function cleanText(text: string): string {
  return text.replace(/\x00/g, '');
}

// Prompt de IA simplificado: solo extrae datos, no califica.
const prompt = `
Actúa como un sistema experto de extracción de datos (Data Extraction Specialist). Tu única función es analizar el texto de un Curriculum Vitae (CV) y extraer con la máxima precisión tres datos específicos: nombre completo, email y teléfono. Debes ser metódico y seguir las siguientes reglas estrictas.

**Texto del CV a Analizar:**
"""{TEXTO_CV}"""

---

**REGLAS DE EXTRACCIÓN DETALLADAS:**
1.  **nombreCompleto:** Busca el nombre más prominente. Ignora "Curriculum Vitae", "CV", etc. Intenta capturar nombre y al menos un apellido. Si no lo encuentras, usa null.
2.  **email:** Busca patrones claros de email con "@". Extrae solo la dirección. Si hay varios, elige el más profesional. Si no lo encuentras, usa null.
3.  **telefono:** Reconoce múltiples formatos. Prioriza números móviles. Si no lo encuentras, usa null.

---

**Formato de Salida Obligatorio (JSON estricto):**
Tu única respuesta debe ser un objeto JSON válido con exactamente estas tres claves: "nombreCompleto", "email", "telefono".
`;

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

    // 1. Decodificar y extraer el texto del PDF
    const pdfBytes = atob(cv.base64.split(',')[1]);
    const buffer = new Uint8Array(pdfBytes.length);
    for (let i = 0; i < pdfBytes.length; i++) {
        buffer[i] = pdfBytes.charCodeAt(i);
    }
    
    const pdfData = await pdf(buffer);
    const textoCV = cleanText(pdfData.text);

    if (!textoCV || textoCV.length < 50) {
      throw new Error("El contenido del PDF está vacío o no se pudo leer.");
    }
    
    // Guardar el texto extraído en la base de datos
    await supabaseAdmin.from('candidatos').update({ texto_cv: textoCV }).eq('id', cv.id);

    // 2. Preparar y llamar a la IA para el análisis
    const textoCVOptimizado = textoCV.substring(0, 4000);
    const finalPrompt = prompt.replace('{TEXTO_CV}', textoCVOptimizado);

    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: "user", content: finalPrompt }],
      model: "gpt-4o-mini",
      response_format: { "type": "json_object" },
    });

    const iaResult = JSON.parse(chatCompletion.choices[0].message.content);

    // 3. Actualizar el candidato con los datos extraídos
    const datosActualizados = {
      nombre_candidato: iaResult.nombreCompleto,
      email: iaResult.email,
      telefono: iaResult.telefono,
      resumen: 'Datos de contacto extraídos de la carga pública.' // Un resumen genérico
    };

    const { error: updateError } = await supabaseAdmin
      .from('candidatos')
      .update(datosActualizados)
      .eq('id', cv.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, message: `CV genérico ${cv.id} procesado.` }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
      status: 200,
    });

  } catch (error) {
    console.error('Error en la función process-generic-cv:', error);
    // En caso de error, actualiza el resumen para indicar el fallo
    const payload = await req.json().catch(() => ({ record: {} }));
    if (payload.record?.id) {
        await supabaseAdmin
            .from('candidatos')
            .update({ resumen: `Error en análisis genérico: ${error.message}` })
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
