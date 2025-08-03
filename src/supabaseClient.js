// Importamos la librería de Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';

// Creamos y exportamos el cliente de Supabase para usarlo en otros archivos
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
