const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 建立 Gmail SMTP 寄信器（沿用邀請信已設定的 GMAIL_USER / GMAIL_APP_PASSWORD）
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

function buildPayeeEmailHtml({ payeeName, voucherNo, amount, paymentDate }) {
  return `
    <div style="font-family: 'Microsoft JhengHei', Arial, sans-serif; max-width:520px; margin:0 auto; color:#1e293b;">
      <h2 style="color:#0f766e;">款項已匯出通知</h2>
      <p>您好，${payeeName || ''}：</p>
      <p>您登記為受款人的請款單，已完成付款作業，明細如下：</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">單據編號</td><td style="padding:6px 12px; font-weight:600;">${voucherNo}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">匯款金額</td><td style="padding:6px 12px; font-weight:600;">NT$ ${Number(amount || 0).toLocaleString()}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">付款日期</td><td style="padding:6px 12px; font-weight:600;">${paymentDate || ''}</td></tr>
      </table>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">此信件為系統自動發送，請勿直接回覆；若有疑問請聯繫財務部門。</p>
    </div>
  `;
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

    const { voucherId } = req.body || {};
    if (!voucherId) {
      res.status(400).json({ ok: false, message: '請提供 voucherId。' });
      return;
    }

    const { data: voucher, error: vError } = await supabaseAdmin
      .from('vouchers')
      .select('id, voucher_no, payment_date, total_amount')
      .eq('id', voucherId)
      .single();
    if (vError || !voucher) {
      res.status(404).json({ ok: false, message: '查無此單據。' });
      return;
    }

    const { data: lines, error: lError } = await supabaseAdmin
      .from('voucher_lines')
      .select('payee_identifier, amount')
      .eq('voucher_id', voucherId);
    if (lError) {
      res.status(400).json({ ok: false, message: lError.message });
      return;
    }

    const identifiers = [...new Set((lines || []).map(l => l.payee_identifier).filter(Boolean))];
    if (identifiers.length === 0) {
      res.status(200).json({ ok: true, message: '此單據沒有登記受款人資料，略過通知。', sentCount: 0 });
      return;
    }

    const { data: payees, error: pError } = await supabaseAdmin
      .from('payees')
      .select('identifier, name, email')
      .in('identifier', identifiers);
    if (pError) {
      res.status(400).json({ ok: false, message: pError.message });
      return;
    }
    const payeeByIdentifier = {};
    (payees || []).forEach(p => { payeeByIdentifier[p.identifier] = p; });

    // 同一位受款人在同一張單據可能出現在多個明細行，先加總金額再各寄一封信
    const totalsByIdentifier = {};
    (lines || []).forEach(l => {
      if (!l.payee_identifier) return;
      totalsByIdentifier[l.payee_identifier] = (totalsByIdentifier[l.payee_identifier] || 0) + Number(l.amount || 0);
    });

    const transporter = getMailTransporter();
    if (!transporter) {
      res.status(200).json({ ok: true, message: 'GMAIL_USER / GMAIL_APP_PASSWORD 尚未設定，略過寄信。', sentCount: 0 });
      return;
    }

    let sentCount = 0;
    const skipped = [];
    const errors = [];

    for (const identifier of identifiers) {
      const payee = payeeByIdentifier[identifier];
      if (!payee?.email) {
        skipped.push(identifier);
        continue;
      }
      try {
        await transporter.sendMail({
          from: `"財務管理系統" <${process.env.GMAIL_USER}>`,
          to: payee.email,
          subject: `款項已匯出通知－單據 ${voucher.voucher_no}`,
          html: buildPayeeEmailHtml({
            payeeName: payee.name,
            voucherNo: voucher.voucher_no,
            amount: totalsByIdentifier[identifier] || voucher.total_amount,
            paymentDate: voucher.payment_date
          })
        });
        sentCount++;
      } catch (err) {
        errors.push(`${payee.email}：${err.message}`);
      }
    }

    res.status(200).json({
      ok: true,
      message: `已寄出 ${sentCount} 封通知信${skipped.length ? `，${skipped.length} 位受款人未登記 Email 已略過` : ''}${errors.length ? `，${errors.length} 封寄送失敗` : ''}。`,
      sentCount,
      skippedCount: skipped.length,
      errors
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: `伺服器發生錯誤：${error.message}` });
  }
};
