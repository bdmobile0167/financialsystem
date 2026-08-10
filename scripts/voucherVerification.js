import { supabase } from './supabaseClient.js';

/**
 * 歸帳前勾稽核對（即時勾稽）
 * 在真正寫入分錄、扣款、銷案之前，先檢查這張單據的資料是否經得起驗證，
 * 避免「明細金額對不上」「發票金額對不上」「科目選錯」這類問題被悄悄歸帳。
 *
 * @returns {Promise<{canProceed: boolean, notes: {level:'ok'|'warn'|'error', text:string}[]}>}
 */
export async function runVoucherCrossVerification(voucherId, accountCode) {
  const notes = [];
  let hasError = false;

  const { data: voucher, error } = await supabase
    .from('vouchers')
    .select('total_amount, voucher_lines(amount), invoices(amount)')
    .eq('id', voucherId)
    .single();

  if (error || !voucher) {
    return { canProceed: false, notes: [{ level: 'error', text: '❌ 讀取單據資料失敗，無法進行勾稽核對。' }] };
  }

  const totalAmount = Number(voucher.total_amount || 0);
  const linesTotal = (voucher.voucher_lines || []).reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const invoicesTotal = (voucher.invoices || []).reduce((sum, i) => sum + Number(i.amount || 0), 0);

  // 1. 明細加總 vs 憑證總額（借貸最基本的平衡性檢查）
  if (Math.abs(linesTotal - totalAmount) > 1) {
    hasError = true;
    notes.push({ level: 'error', text: `❌ 明細加總（NT$${linesTotal.toLocaleString()}）與憑證總額（NT$${totalAmount.toLocaleString()}）不符` });
  } else {
    notes.push({ level: 'ok', text: '✓ 明細加總與憑證總額相符' });
  }

  // 2. 發票／收據佐證與金額勾稽
  const invoiceCount = (voucher.invoices || []).length;
  if (invoiceCount === 0) {
    notes.push({ level: 'warn', text: '⚠️ 此單據未附上任何發票或收據佐證' });
  } else if (Math.abs(invoicesTotal - totalAmount) > 1) {
    notes.push({ level: 'warn', text: `⚠️ 發票／收據總額（NT$${invoicesTotal.toLocaleString()}）與憑證總額（NT$${totalAmount.toLocaleString()}）有差額，請確認是否有部分代墊或免開立發票項目` });
  } else {
    notes.push({ level: 'ok', text: '✓ 發票／收據金額與憑證總額相符' });
  }

  // 3. 歸帳科目有效性
  if (!accountCode) {
    hasError = true;
    notes.push({ level: 'error', text: '❌ 尚未選擇歸帳會計科目' });
  } else {
    const { data: acc } = await supabase.from('accounts').select('code, type').eq('code', accountCode).maybeSingle();
    if (!acc) {
      hasError = true;
      notes.push({ level: 'error', text: `❌ 選擇的會計科目「${accountCode}」不存在於科目表中` });
    } else if (acc.type !== 'expense') {
      notes.push({ level: 'warn', text: `⚠️ 選擇的科目「${accountCode}」類型為「${acc.type}」，一般報支歸帳應選費用類科目，請確認是否選錯` });
    } else {
      notes.push({ level: 'ok', text: '✓ 歸帳科目有效' });
    }
  }

  return { canProceed: !hasError, notes };
}
