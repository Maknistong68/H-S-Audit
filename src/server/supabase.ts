import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/** One client for the whole app; the session lives in localStorage and refreshes itself when online. */
export const supabase = createClient(env.url, env.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Supabase = typeof supabase;
