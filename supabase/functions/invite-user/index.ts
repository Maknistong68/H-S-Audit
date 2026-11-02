// Invites a teammate: an admin posts { email, role }; the invite row is recorded (the dashboard's trigger gives the
// new account that role) and Supabase Auth emails a link that opens the app's /welcome screen.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://hse-audit-nine.vercel.app', 'http://localhost:5173', 'http://localhost:4173'];
const ROLES = ['viewer', 'auditor', 'lead', 'admin'];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });

function secretKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  return keys.default ?? '';
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, headers);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'sign in first' }, 401, headers);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? (JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>).default ?? '';

  // The caller, with their own rights: only admins may invite.
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'sign in first' }, 401, headers);
  const { data: profile } = await caller.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (profile?.role !== 'admin') return json({ error: 'admin only' }, 403, headers);

  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400, headers);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? 'auditor');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'enter a valid email address' }, 400, headers);
  if (!ROLES.includes(role)) return json({ error: 'unknown role' }, 400, headers);

  const admin = createClient(url, secretKey(), { auth: { persistSession: false } });
  const { error: inviteRowError } = await admin.from('invites').upsert({ email, role, invited_by: userData.user.id }, { onConflict: 'email' });
  if (inviteRowError) return json({ error: inviteRowError.message }, 500, headers);

  const redirectTo = `${origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]}/welcome`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message)) return json({ status: 'exists' }, 200, headers);
    return json({ error: error.message }, 500, headers);
  }
  return json({ status: 'invited' }, 200, headers);
});
