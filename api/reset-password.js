const crypto = require('crypto');
const { createAdminClient, json, requireRole } = require('./_supabaseServer');

module.exports = async (req, res) => {
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, correlationId, message: 'Only POST is allowed.' });
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
    const roleCheck = await requireRole(req, supabaseAdmin, ['admin', 'super_admin']);
    if (!roleCheck.ok) {
      json(res, roleCheck.status, { ok: false, correlationId, message: roleCheck.message });
      return;
    }

    const userId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
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
