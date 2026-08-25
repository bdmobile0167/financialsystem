const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'Bd@1234';
const APP_LOGIN_URL = process.env.APP_LOGIN_URL || 'https://financialsystem-nine.vercel.app';
const ALLOWED_ROLES = new Set(['admin', 'accounting', 'manager', 'employee']);

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

function validateInvitePayload(body = {}) {
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
  if (!fullName) errors.push('fullName 為必填');
  if (!ALLOWED_ROLES.has(role)) errors.push('role 不在允許範圍');
  if (departmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId)) {
    errors.push('departmentId 必須是 UUID');
  }
  if (!password || password.length < 6) errors.push('password 至少需要 6 個字元');

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
      <h2 style="color:#1d4ed8;">財務管理系統帳號已建立</h2>
      <p>${fullName || ''} 您好，管理員已建立您的登入帳號。</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">登入信箱</td><td style="padding:6px 12px; font-weight:600;">${to}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">初始密碼</td><td style="padding:6px 12px; font-weight:600;">${tempPassword}</td></tr>
      </table>
      <p><a href="${APP_LOGIN_URL}" style="display:inline-block; background:#1d4ed8; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">前往登入</a></p>
      <p style="color:#dc2626; font-size:14px;">首次登入後請立即變更密碼。</p>
      <p style="color:#94a3b8; font-size:12px;">Correlation ID: ${correlationId}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"財務管理系統" <${process.env.GMAIL_USER}>`,
      to,
      subject: '財務管理系統帳號邀請',
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
    const { data: callerRole, error: roleQueryError } = await callerClient
      .rpc('get_invite_caller_role');

    if (roleQueryError || !callerRole) {
      json(res, 500, {
        ok: false,
        correlationId,
        message: `無法讀取呼叫者角色資料：${roleQueryError?.message || '查無資料'}`
      });
      return;
    }

    if (callerRole !== 'admin') {
      json(res, 403, { ok: false, correlationId, message: '僅 admin 可以邀請帳號' });
      return;
    }

    const validation = validateInvitePayload(req.body || {});
    if (!validation.ok) {
      json(res, 400, { ok: false, correlationId, message: validation.errors.join('；') });
      return;
    }

    const { email, fullName, role, departmentId, employeeId, password, permissions } = validation.value;
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError) {
      json(res, 400, { ok: false, correlationId, message: `建立 Auth user 失敗：${createError.message}` });
      return;
    }

    const createdUserId = createdUser?.user?.id;
    try {
      const { error: insertProfileError } = await supabaseAdmin.from('profiles').upsert({
        id: createdUserId,
        email,
        full_name: fullName,
        role,
        department_id: departmentId,
        active: true,
        must_change_password: true,
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
      json(res, 400, { ok: false, correlationId, message: `寫入 profile 失敗，已嘗試回滾 Auth user：${profileError.message}` });
      return;
    }

    const emailResult = await sendInviteEmail({ to: email, fullName, tempPassword: password, correlationId });

    json(res, 200, {
      ok: true,
      correlationId,
      message: emailResult.sent
        ? `帳號已建立並寄出邀請信：${email}`
        : `帳號已建立，但 Email 未寄出：${emailResult.reason}`,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.reason,
      credentials: { email, tempPassword: password }
    });
  } catch (error) {
    console.error('invite failed', { correlationId, error: error.message });
    json(res, 500, { ok: false, correlationId, message: `邀請流程失敗：${error.message}` });
  }
};
