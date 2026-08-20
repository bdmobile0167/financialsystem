const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'Bd@1234';
const APP_LOGIN_URL = process.env.APP_LOGIN_URL || 'https://financialsystem-nine.vercel.app';

function json(res, status, body) {
  res.status(status).json(body);
}

function isLegacyServiceRoleJwt(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Vercel is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!isLegacyServiceRoleJwt(key)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a service_role JWT. Set the Supabase service_role secret in Vercel environment variables, not the anon or publishable key.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
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

async function sendInviteEmail({ to, fullName, tempPassword }) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'GMAIL_USER / GMAIL_APP_PASSWORD is not configured.' };
  }

  const safeName = fullName || 'User';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width:520px; margin:0 auto; color:#1e293b;">
      <h2 style="color:#1d4ed8;">Financial system account created</h2>
      <p>Hello ${safeName}, your account has been created.</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">Login email</td><td style="padding:6px 12px; font-weight:600;">${to}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">Temporary password</td><td style="padding:6px 12px; font-weight:600;">${tempPassword}</td></tr>
      </table>
      <p><a href="${APP_LOGIN_URL}" style="display:inline-block; background:#1d4ed8; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Sign in</a></p>
      <p style="color:#dc2626; font-size:14px;">Please change your password after your first sign-in.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Financial System" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Financial system account invitation',
      html
    });
    return { sent: true };
  } catch (err) {
    console.error('invite email send failed:', { message: err.message, code: err.code });
    return { sent: false, reason: err.message };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, message: 'Use POST.' });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createAdminClient();
  } catch (err) {
    json(res, 500, { ok: false, message: err.message });
    return;
  }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      json(res, 401, { ok: false, message: 'Missing Authorization bearer token.' });
      return;
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      json(res, 401, { ok: false, message: 'Invalid or expired session token.' });
      return;
    }

    const { data: callerProfile, error: roleQueryError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single();

    if (roleQueryError || !callerProfile) {
      console.error('invite role lookup failed:', {
        code: roleQueryError?.code,
        message: roleQueryError?.message,
        details: roleQueryError?.details
      });
      json(res, 500, {
        ok: false,
        message: `Unable to read your role profile: ${roleQueryError?.code ? roleQueryError.code + ' - ' : ''}${roleQueryError?.message || 'profile not found'}`
      });
      return;
    }

    if (callerProfile.role !== 'admin') {
      json(res, 403, { ok: false, message: 'Only admin users can invite new accounts.' });
      return;
    }

    const {
      email,
      fullName,
      role = 'employee',
      departmentId = null,
      password,
      permissions = {},
      employeeId = null
    } = req.body || {};

    if (!email || !fullName) {
      json(res, 400, { ok: false, message: 'Email and full name are required.' });
      return;
    }

    const finalPassword = (password && password.trim()) ? password.trim() : DEFAULT_PASSWORD;
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true
    });

    if (createError) {
      json(res, 400, { ok: false, message: `Auth user creation failed: ${createError.message}` });
      return;
    }

    const authUserId = createdUser?.user?.id;
    const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert({
      id: authUserId,
      email,
      full_name: fullName,
      role,
      department_id: departmentId || null,
      active: true,
      must_change_password: true,
      permissions,
      employee_id: employeeId || null
    });

    if (insertProfileError) {
      let rollbackMessage = '';
      if (authUserId) {
        const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (rollbackError) {
          rollbackMessage = ` Rollback also failed: ${rollbackError.message}`;
          console.error('invite rollback failed:', {
            authUserId,
            profileError: insertProfileError.message,
            rollbackError: rollbackError.message
          });
        }
      }
      json(res, 500, {
        ok: false,
        message: `Auth user was created but profile insert failed; rollback attempted. ${insertProfileError.message}${rollbackMessage}`
      });
      return;
    }

    const emailResult = await sendInviteEmail({ to: email, fullName, tempPassword: finalPassword });

    json(res, 200, {
      ok: true,
      message: emailResult.sent
        ? `Account created and invite email sent to ${email}.`
        : `Account created but invite email failed: ${emailResult.reason}`,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.reason,
      credentials: { email, tempPassword: finalPassword }
    });
  } catch (error) {
    console.error('invite API unexpected error:', { message: error.message, stack: error.stack });
    json(res, 500, { ok: false, message: `Invite failed: ${error.message}` });
  }
};
