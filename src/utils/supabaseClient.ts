import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Stable per-install identifier sent with every sync write so diagnostics can
 * tell which device produced a row. Stored in localStorage; regenerated only
 * if the user clears site data.
 */
export const getDeviceId = (): string => {
  const KEY = 'hos-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
};

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at boot rather than silently disabling accounts: a missing
  // publishable key is a deployment mistake, not a runtime condition.
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Account sign-in will be unavailable until they are set.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:5173/__invalid_supabase_url__',
  supabaseAnonKey || 'invalid-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // OAuth redirect returns tokens in the URL hash
      storageKey: 'hos-supabase-auth',
    },
  }
);

/** The Supabase project URL, e.g. for building OAuth redirect URLs. */
export const SUPABASE_URL = supabaseUrl || '';
