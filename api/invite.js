const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'Bd@1234';
const APP_LOGIN_URL = process.env.APP_LOGIN_URL || 'https://financialsystem-nine.vercel.app';
const ALLOWED_ROLES = new Set(['admin', 'accounting', 'manager', 'employee']);

function json(res, status, body) {
  res.status(status).json(body);
}

function useSupabaseInviteEmail() {
  const provider = String(process.env.INVITE_EMAIL_PROVIDER || '').trim().toLowerCase();
  return provider === 'supabase' || process.env.SUPABASE_AUTH_INVITE_EMAIL === 'true';
}

function isInvalidAdminKey(key) {
  if (/^(sb_publishable_|sb_anon_)/.test(key)) return true;
  if (!key.startsWith('eyJ')) return false;

  try {
    const [, payload] = key.split('.');
    if (!payload) return true;
    const decoded = Buffer
      .from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      .toString('utf8');
    return JSON.parse(decoded).role !== 'service_role';
  } catch (_) {
    return true;
  }
}

function createAdminClient() {
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !supabaseSecretKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (isInvalidAdminKey(supabaseSecretKey)) {
    throw new Error('Supabase admin key is not a secret/service role key. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in Vercel Production.');
  }

  return createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email 格式不正確');
  if (!fullName) errors.push('fullName 必填');
  if (!ALLOWED_ROLES.has(role)) errors.push('role 不允許');
  if (departmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId)) {
    errors.push('departmentId 必須是 UUID');
  }
  if (!options.supabaseInvite && (!password || password.length < 6)) {
    errors.push('password 至少 6 個字元');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { email, fullName, role, departmentId, employeeId, password, permissions }
  };
}

async function sendInviteEmail({ to, fullName, tempPassword, correlationId }) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'GMAIL_USER / GMAIL_APP_PASSWORD 未設定' };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width:520px; margin:0 auto; color:#1e293b;">
      <h2 style="color:#1d4ed8;">財務系統帳號已建立</h2>
      <p>${fullName || ''} 您好，管理員已為您建立財務系統帳號。</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">登入帳號</td><td style="padding:6px 12px; font-weight:600;">${to}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">初始密碼</td><td style="padding:6px 12px; font-weight:600;">${tempPassword}</td></tr>
      </table>
      <p><a href="${APP_LOGIN_URL}" style="display:inline-block; background:#1d4ed8; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">前往登入</a></p>
      <p style="color:#dc2626; font-size:14px;">首次登入後系統會要求變更密碼。</p>
      <p style="color:#94a3b8; font-size:12px;">Correlation ID: ${correlationId}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"財務系統" <${process.env.GMAIL_USER}>`,
      to,
      subject: '財務系統帳號邀請',
      html
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
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
      json(res, 401, { ok: false, correlationId, message: '缺少登入權杖' });
      return;
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      json(res, 401, { ok: false, correlationId, message: '登入權杖無效，請重新登入' });
      return;
    }

    const callerClient = createCallerClient(token);
    const { data: callerRole, error: roleQueryError } = await callerClient.rpc('get_invite_caller_role');

    if (roleQueryError || !callerRole) {
      json(res, 500, {
        ok: false,
        correlationId,
        message: `讀取邀請權限失敗：${roleQueryError?.message || '未知錯誤'}`
      });
      return;
    }

    if (!['admin', 'super_admin'].includes(callerRole)) {
      json(res, 403, { ok: false, correlationId, message: 'Only admin or super_admin users can invite accounts.' });
      return;
    }

    const shouldUseSupabaseInvite = useSupabaseInviteEmail();
    const validation = validateInvitePayload(req.body || {}, { supabaseInvite: shouldUseSupabaseInvite });
    if (!validation.ok) {
      json(res, 400, { ok: false, correlationId, message: validation.errors.join('，') });
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
      const actionName = shouldUseSupabaseInvite ? '建立 Supabase 邀請' : '建立 Auth user';
      json(res, 400, { ok: false, correlationId, message: `${actionName} 失敗：${authResult.error.message}` });
      return;
    }

    const createdUserId = authResult.data?.user?.id;
    try {
      const { error: insertProfileError } = await supabaseAdmin.from('profiles').upsert({
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

      if (insertProfileError) throw insertProfileError;
    } catch (profileError) {
      if (createdUserId) {
        const rollback = await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        if (rollback.error) {
          console.error('invite rollback failed', { correlationId, createdUserId, error: rollback.error.message });
        }
      }
      json(res, 400, {
        ok: false,
        correlationId,
        message: `寫入 profile 失敗，已嘗試回滾 Auth user：${profileError.message}`
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
        ? `帳號已建立，Supabase 已接受邀請請求：${email}。實際寄信由 Supabase SMTP 背景處理，請用 Auth logs 或 SMTP test email 確認。`
        : (emailResult.sent
            ? `帳號已建立並寄出邀請信：${email}`
            : `帳號已建立，但 Email 未寄出：${emailResult.reason}`),
      emailSent: shouldUseSupabaseInvite ? null : emailResult.sent,
      emailQueued: shouldUseSupabaseInvite ? true : Boolean(emailResult.sent),
      emailProvider: shouldUseSupabaseInvite ? 'supabase' : 'gmail',
      emailError: shouldUseSupabaseInvite || emailResult.sent ? null : emailResult.reason,
      emailNote: shouldUseSupabaseInvite ? emailResult.reason : null,
      credentials: { email, tempPassword: shouldUseSupabaseInvite ? null : password }
    });
  } catch (error) {
    console.error('invite failed', { correlationId, error: error.message });
    json(res, 500, { ok: false, correlationId, message: `邀請流程失敗：${error.message}` });
  }
};
