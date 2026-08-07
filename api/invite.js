const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'Bd@1234';
const APP_LOGIN_URL = process.env.APP_LOGIN_URL || 'https://financialsystem-nine.vercel.app';

// 建立 Gmail SMTP 寄信器（需要在 Vercel 環境變數設定 GMAIL_USER 與 GMAIL_APP_PASSWORD）
function getMailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD  // Google 帳號的「應用程式密碼」，不是登入密碼
    }
  });
}

async function sendInviteEmail({ to, fullName, tempPassword }) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'GMAIL_USER / GMAIL_APP_PASSWORD 尚未設定' };
  }

  const html = `
    <div style="font-family: 'Microsoft JhengHei', Arial, sans-serif; max-width:520px; margin:0 auto; color:#1e293b;">
      <h2 style="color:#1d4ed8;">財務管理系統 － 帳號開通通知</h2>
      <p>您好，${fullName || ''}：</p>
      <p>管理員已為您開通財務管理系統的帳號，登入資訊如下：</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">登入信箱</td><td style="padding:6px 12px; font-weight:600;">${to}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">初始密碼</td><td style="padding:6px 12px; font-weight:600;">${tempPassword}</td></tr>
      </table>
      <p>
        <a href="${APP_LOGIN_URL}" style="display:inline-block; background:#1d4ed8; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">
          前往登入
        </a>
      </p>
      <p style="color:#dc2626; font-size:14px;">⚠️ 為了帳號安全，系統會在您第一次登入時要求立即設定新密碼，請勿將此密碼分享給他人。</p>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">此信件為系統自動發送，請勿直接回覆。</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"財務管理系統" <${process.env.GMAIL_USER}>`,
      to,
      subject: '財務管理系統 － 您的帳號已開通',
      html
    });
    return { sent: true };
  } catch (err) {
    console.error('寄送邀請信失敗:', err);
    return { sent: false, reason: err.message };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: '只允許 POST 請求。' });
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ ok: false, message: 'Supabase 環境變數未設定。' });
    return;
  }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ ok: false, message: '未登入。' });
      return;
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      res.status(401).json({ ok: false, message: '登入狀態已失效，請重新登入。' });
      return;
    }

    const { data: callerProfile, error: roleQueryError } = await supabaseAdmin
      .from('profiles').select('role').eq('id', callerData.user.id).single();

    if (roleQueryError || !callerProfile) {
      res.status(500).json({
        ok: false,
        message: `無法讀取你的角色資料（${roleQueryError?.message || '查無資料'}）。通常代表 SUPABASE_SERVICE_ROLE_KEY 設定錯誤。`
      });
      return;
    }
    if (callerProfile.role !== 'admin') {
      res.status(403).json({ ok: false, message: '只有管理員可以新增使用者。' });
      return;
    }

    const { email, fullName, role = 'employee', departmentId = null, password } = req.body || {};
    if (!email || !fullName) {
      res.status(400).json({ ok: false, message: '請提供 email 與姓名。' });
      return;
    }

    const finalPassword = (password && password.trim()) ? password.trim() : DEFAULT_PASSWORD;
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, password: finalPassword, email_confirm: true
    });
    if (createError) {
      res.status(400).json({ ok: false, message: `建立帳號失敗：${createError.message}` });
      return;
    }

    const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert({
      id: createdUser.user.id, email, full_name: fullName, role,
      department_id: departmentId, active: true, must_change_password: true
    });
    if (insertProfileError) {
      res.status(400).json({ ok: false, message: `寫入使用者資料失敗：${insertProfileError.message}` });
      return;
    }

    const emailResult = await sendInviteEmail({ to: email, fullName, tempPassword: finalPassword });

    res.status(200).json({
      ok: true,
      message: emailResult.sent ? `已建立帳號並寄出邀請信：${email}` : `已建立帳號：${email}（邀請信寄送失敗：${emailResult.reason}）`,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.reason,
      credentials: { email, tempPassword: finalPassword }
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: `伺服器發生錯誤：${error.message}` });
  }
};