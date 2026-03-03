import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function initSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_KEY
    );
  }
  return supabaseInstance;
}

export function getSupabaseAdmin() {
  return createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const supabase = initSupabase();
export const supabaseAdmin = getSupabaseAdmin();
