const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { createAdminClient, json, requireRole } = require('./_supabaseServer');

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'Bd@1234';
const APP_LOGIN_URL = process.env.APP_LOGIN_URL || 'https://financialsystem-nine.vercel.app';
const ALLOWED_ROLES = new Set(['admin', 'accounting', 'manager', 'employee']);

function useSupabaseInviteEmail() {
  const provider = String(process.env.INVITE_EMAIL_PROVIDER || '').trim().toLowerCase();
  return provider === 'supabase' || process.env.SUPABASE_AUTH_INVITE_EMAIL === 'true';
}

function getMailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

function validateInvitePayload(body = {}, options = {}) {
  const errors = [];
  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.fullName || body.name || '').trim();
  const role = String(body.role || 'employee').trim();
  const departmentId = body.departmentId || null;
  const employeeId = body.employeeId ? String(body.employeeId).trim() : null;
  const password = body.password ? String(body.password).trim() : DEFAULT_PASSWORD;
  const permissions = body.permissions && typeof body.permissions === 'object' && !Array.isArray(body.permissions)
    ? body.permissions
    : {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email is invalid');
  if (!fullName) errors.push('fullName is required');
  if (!ALLOWED_ROLES.has(role)) errors.push('role is invalid');
  if (departmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId)) {
    errors.push('departmentId must be a UUID');
  }
  if (!options.supabaseInvite && password.length < 6) {
    errors.push('password must be at least 6 characters');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { email, fullName, role, departmentId, employeeId, password, permissions }
  };
}

function buildInviteEmailHtml({ fullName, email, tempPassword, correlationId }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width:520px; margin:0 auto; color:#1e293b;">
      <h2 style="color:#1d4ed8;">Financial system account invitation</h2>
      <p>Hello ${fullName || ''}, your account has been created.</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">Login email</td><td style="padding:6px 12px; font-weight:600;">${email}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">Temporary password</td><td style="padding:6px 12px; font-weight:600;">${tempPassword}</td></tr>
      </table>
      <p><a href="${APP_LOGIN_URL}" style="display:inline-block; background:#1d4ed8; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Open financial system</a></p>
      <p style="color:#dc2626; font-size:14px;">Please change your password after first login.</p>
      <p style="color:#94a3b8; font-size:12px;">Correlation ID: ${correlationId}</p>
    </div>
  `;
}

async function sendInviteEmail({ to, fullName, tempPassword, correlationId }) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'GMAIL_USER / GMAIL_APP_PASSWORD are not configured.' };
  }

  try {
    await transporter.sendMail({
      from: `"Financial System" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Financial system account invitation',
      html: buildInviteEmailHtml({ fullName, email: to, tempPassword, correlationId })
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
}

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

    const shouldUseSupabaseInvite = useSupabaseInviteEmail();
    const validation = validateInvitePayload(req.body || {}, { supabaseInvite: shouldUseSupabaseInvite });
    if (!validation.ok) {
      json(res, 400, { ok: false, correlationId, message: validation.errors.join(', ') });
      return;
    }

    const { email, fullName, role, departmentId, employeeId, password, permissions } = validation.value;
    const authResult = shouldUseSupabaseInvite
      ? await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: APP_LOGIN_URL,
          data: { full_name: fullName, role, department_id: departmentId, employee_id: employeeId }
        })
      : await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });

    if (authResult.error) {
      const actionName = shouldUseSupabaseInvite ? 'Supabase invite' : 'Auth user creation';
      json(res, 400, { ok: false, correlationId, message: `${actionName} failed: ${authResult.error.message}` });
      return;
    }

    const createdUserId = authResult.data?.user?.id;
    if (!createdUserId) {
      json(res, 400, { ok: false, correlationId, message: 'Supabase did not return a user id.' });
      return;
    }

    try {
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: createdUserId,
        email,
        full_name: fullName,
        role,
        department_id: departmentId,
        active: true,
        must_change_password: shouldUseSupabaseInvite ? false : true,
        permissions,
        employee_id: employeeId
      }, { onConflict: 'id' });

      if (profileError) throw profileError;
    } catch (profileError) {
      const rollback = await supabaseAdmin.auth.admin.deleteUser(createdUserId);
      if (rollback.error) {
        console.error('invite rollback failed', { correlationId, createdUserId, error: rollback.error.message });
      }

      json(res, 400, {
        ok: false,
        correlationId,
        message: `Profile write failed. Auth user rollback attempted: ${profileError.message}`
      });
      return;
    }

    const emailResult = shouldUseSupabaseInvite
      ? {
          sent: null,
          queued: true,
          provider: 'supabase',
          reason: 'Supabase Auth accepted the invite request. SMTP delivery is asynchronous; verify delivery in Auth logs or SMTP test email.'
        }
      : await sendInviteEmail({ to: email, fullName, tempPassword: password, correlationId });

    json(res, 200, {
      ok: true,
      correlationId,
      message: shouldUseSupabaseInvite
        ? `Account created and Supabase Auth invite queued for ${email}.`
        : (emailResult.sent
            ? `Account created and invite email sent to ${email}.`
            : `Account created, but email was not sent: ${emailResult.reason}`),
      emailSent: shouldUseSupabaseInvite ? null : emailResult.sent,
      emailQueued: shouldUseSupabaseInvite ? true : Boolean(emailResult.sent),
      emailProvider: shouldUseSupabaseInvite ? 'supabase' : 'gmail',
      emailError: shouldUseSupabaseInvite || emailResult.sent ? null : emailResult.reason,
      emailNote: shouldUseSupabaseInvite ? emailResult.reason : null,
      credentials: { email, tempPassword: shouldUseSupabaseInvite ? null : password }
    });
  } catch (error) {
    console.error('invite failed', { correlationId, error: error.message });
    json(res, 500, { ok: false, correlationId, message: `Invite failed: ${error.message}` });
  }
};
