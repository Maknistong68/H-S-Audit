import type { Remote, RemoteAuth } from './remote';

let loaded: { remote: Remote; auth: RemoteAuth } | null = null;

/** The fake server when the app was built for tests, otherwise Supabase. Loaded once. */
export async function loadServer(): Promise<{ remote: Remote; auth: RemoteAuth }> {
  if (loaded) return loaded;
  if (__HS_FAKE__) {
    const { createFake } = await import('./fakeRemote');
    const fake = createFake({ storage: window.localStorage });
    (window as unknown as { __hsFake: unknown }).__hsFake = fake.control;
    loaded = { remote: fake.remote, auth: fake.auth };
  } else {
    const [{ supabase }, { createSupabaseRemote }, { createSupabaseAuth }] = await Promise.all([import('./supabase'), import('./supabaseRemote'), import('./supabaseAuth')]);
    loaded = { remote: createSupabaseRemote(supabase), auth: createSupabaseAuth(supabase) };
  }
  return loaded;
}

export function server(): { remote: Remote; auth: RemoteAuth } {
  if (!loaded) throw new Error('server not loaded yet');
  return loaded;
}
