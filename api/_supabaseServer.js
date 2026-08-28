const { createClient } = require('@supabase/supabase-js');

function json(res, status, body) {
  res.status(status).json(body);
}

function getBearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function getSupabaseAdminKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function isInvalidAdminKey(key) {
  if (!key || /^(sb_publishable_|sb_anon_)/.test(key)) return true;
  if (!key.startsWith('eyJ')) return false;

  try {
    const [, payload] = key.split('.');
    if (!payload) return true;
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalizedPayload, 'base64').toString('utf8');
    return JSON.parse(decoded).role !== 'service_role';
  } catch (_) {
    return true;
  }
}

function createAdminClient() {
  const adminKey = getSupabaseAdminKey();
  if (!process.env.SUPABASE_URL || !adminKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (isInvalidAdminKey(adminKey)) {
    throw new Error('Supabase admin key is not a secret/service role key.');
  }

  return createClient(process.env.SUPABASE_URL, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function createCallerClient(accessToken) {
  const apiKey = process.env.SUPABASE_ANON_KEY || getSupabaseAdminKey();
  if (!process.env.SUPABASE_URL || !apiKey) {
    throw new Error('Missing SUPABASE_URL or Supabase API key.');
  }

  return createClient(process.env.SUPABASE_URL, apiKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function requireAuthenticatedUser(req, supabaseAdmin) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, message: 'Missing login session. Please sign in again.' };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: 'Invalid login session. Please sign in again.' };
  }

  return { ok: true, token, user: data.user };
}

async function requireRole(req, supabaseAdmin, allowedRoles) {
  const auth = await requireAuthenticatedUser(req, supabaseAdmin);
  if (!auth.ok) return auth;

  const callerClient = createCallerClient(auth.token);
  const { data: role, error } = await callerClient.rpc('get_invite_caller_role');
  if (error || !role) {
    return {
      ok: false,
      status: 403,
      message: `Unable to verify caller role: ${error?.message || 'empty role'}`
    };
  }

  if (!allowedRoles.includes(role)) {
    return { ok: false, status: 403, message: `This action requires one of these roles: ${allowedRoles.join(', ')}.` };
  }

  return { ok: true, token: auth.token, user: auth.user, role };
}

module.exports = {
  createAdminClient,
  createCallerClient,
  getBearerToken,
  isInvalidAdminKey,
  json,
  requireAuthenticatedUser,
  requireRole
};
