const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function json(res, status, body) {
  res.status(status).json(body);
}

function createAdminClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function createCallerClient(accessToken) {
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !apiKey) {
    throw new Error('Missing SUPABASE_URL or Supabase API key');
  }

  return createClient(process.env.SUPABASE_URL, apiKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

module.exports = async (req, res) => {
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, correlationId, message: 'Only POST is allowed' });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createAdminClient();
  } catch (error) {
    json(res, 500, { ok: false, correlationId, message: error.message });
    return;
  }

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      json(res, 401, { ok: false, correlationId, message: 'Missing or expired login session. Please sign in again.' });
      return;
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      json(res, 401, { ok: false, correlationId, message: 'Invalid login session. Please sign in again.' });
      return;
    }

    const callerClient = createCallerClient(token);
    const { data: callerRole, error: roleQueryError } = await callerClient.rpc('get_invite_caller_role');

    if (roleQueryError || callerRole !== 'admin') {
      json(res, 403, { ok: false, correlationId, message: 'Only admin users can reset passwords.' });
      return;
    }

    const userId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      json(res, 400, { ok: false, correlationId, message: 'userId must be a valid UUID.' });
      return;
    }

    if (password.length < 6) {
      json(res, 400, { ok: false, correlationId, message: 'Password must be at least 6 characters.' });
      return;
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      json(res, 400, { ok: false, correlationId, message: `Auth password update failed: ${updateError.message}` });
      return;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', userId);

    if (profileError) {
      json(res, 400, { ok: false, correlationId, message: `Password updated, but profile sync failed: ${profileError.message}` });
      return;
    }

    json(res, 200, { ok: true, correlationId });
  } catch (error) {
    console.error('reset password failed', { correlationId, error: error.message });
    json(res, 500, { ok: false, correlationId, message: `Reset password failed: ${error.message}` });
  }
};
