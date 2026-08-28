const nodemailer = require('nodemailer');
const { createAdminClient, json, requireRole } = require('./_supabaseServer');

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPayeeEmailHtml({ payeeName, voucherNo, amount, paymentDate }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width:520px; margin:0 auto; color:#1e293b;">
      <h2 style="color:#0f766e;">Payment completed</h2>
      <p>Hello ${escapeHtml(payeeName || '')},</p>
      <p>Your payment has been processed. Details are listed below.</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:6px 12px; color:#64748b;">Voucher no.</td><td style="padding:6px 12px; font-weight:600;">${escapeHtml(voucherNo)}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">Amount</td><td style="padding:6px 12px; font-weight:600;">NT$ ${Number(amount || 0).toLocaleString()}</td></tr>
        <tr><td style="padding:6px 12px; color:#64748b;">Payment date</td><td style="padding:6px 12px; font-weight:600;">${escapeHtml(paymentDate || '')}</td></tr>
      </table>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">This is an automatic notification from the financial system.</p>
    </div>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, message: 'Only POST is allowed.' });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createAdminClient();
  } catch (error) {
    json(res, 500, { ok: false, message: error.message });
    return;
  }

  try {
    const roleCheck = await requireRole(req, supabaseAdmin, ['admin', 'super_admin', 'accounting']);
    if (!roleCheck.ok) {
      json(res, roleCheck.status, { ok: false, message: roleCheck.message });
      return;
    }

    const { voucherId } = req.body || {};
    if (!voucherId) {
      json(res, 400, { ok: false, message: 'voucherId is required.' });
      return;
    }

    const { data: voucher, error: voucherError } = await supabaseAdmin
      .from('vouchers')
      .select('id, voucher_no, payment_date, total_amount')
      .eq('id', voucherId)
      .single();
    if (voucherError || !voucher) {
      json(res, 404, { ok: false, message: 'Voucher was not found.' });
      return;
    }

    const { data: lines, error: lineError } = await supabaseAdmin
      .from('voucher_lines')
      .select('payee_identifier, amount')
      .eq('voucher_id', voucherId);
    if (lineError) {
      json(res, 400, { ok: false, message: lineError.message });
      return;
    }

    const identifiers = [...new Set((lines || []).map(line => line.payee_identifier).filter(Boolean))];
    if (identifiers.length === 0) {
      json(res, 200, { ok: true, message: 'Voucher has no payee identifiers to notify.', sentCount: 0 });
      return;
    }

    const { data: payees, error: payeeError } = await supabaseAdmin
      .from('payees')
      .select('identifier, name, email')
      .in('identifier', identifiers);
    if (payeeError) {
      json(res, 400, { ok: false, message: payeeError.message });
      return;
    }

    const payeeByIdentifier = Object.fromEntries((payees || []).map(payee => [payee.identifier, payee]));
    const totalsByIdentifier = {};
    for (const line of lines || []) {
      if (!line.payee_identifier) continue;
      totalsByIdentifier[line.payee_identifier] = (totalsByIdentifier[line.payee_identifier] || 0) + Number(line.amount || 0);
    }

    const transporter = getMailTransporter();
    if (!transporter) {
      json(res, 200, {
        ok: true,
        message: 'GMAIL_USER / GMAIL_APP_PASSWORD are not configured. No email was sent.',
        sentCount: 0
      });
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
          from: `"Financial System" <${process.env.GMAIL_USER}>`,
          to: payee.email,
          subject: `Payment completed: ${voucher.voucher_no}`,
          html: buildPayeeEmailHtml({
            payeeName: payee.name,
            voucherNo: voucher.voucher_no,
            amount: totalsByIdentifier[identifier] || voucher.total_amount,
            paymentDate: voucher.payment_date
          })
        });
        sentCount++;
      } catch (error) {
        errors.push(`${payee.email}: ${error.message}`);
      }
    }

    json(res, 200, {
      ok: true,
      message: `Sent ${sentCount} payment notification(s).`,
      sentCount,
      skippedCount: skipped.length,
      errorCount: errors.length,
      skipped,
      errors
    });
  } catch (error) {
    json(res, 500, { ok: false, message: `Payment notification failed: ${error.message}` });
  }
};
