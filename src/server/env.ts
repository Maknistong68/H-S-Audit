/** Build-time server settings. The publishable key is safe in a browser: the database's access rules do the guarding. */
export const env = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  key: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '',
  /** In-memory server for tests; a build-time constant so real builds carry no fake code. */
  fake: __HS_FAKE__,
};

export function serverConfigured(): boolean {
  return env.fake || (env.url.startsWith('https://') && env.key.length > 0);
}
