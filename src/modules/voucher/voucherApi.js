import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment } from './attachments.js';
import { resolveVoucherNumber } from './voucherNumbering.js';
import { VOUCHER_STATUS } from './voucherStatus.js';  // ← 同一資料夾

export async function fetchAccounts() {
  const { data, error } = await supabase.from('accounts').select('*').order('code');
  if (error) throw error;
  return data;
}

export async function fetchBankAccounts() {
  const { data, error } = await supabase.from('bank_accounts').select('*').order('bank_name');
  if (error) throw error;
  return data;
}

export async function fetchDepartments() {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function fetchMyVouchers() {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchWorkflowLogs(voucherId) {
  const { data, error } = await supabase
    .from('voucher_workflow_logs')
    .select('*, actor:profiles(full_name,email)')
    .eq('voucher_id', voucherId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function logWorkflow(voucherId, action, fromStatus, toStatus, rejectReason = null) {
  // 1. 嚴格確認登入狀態
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) throw authError;
  if (!user) {
    throw new Error('尚未登入或登入狀態已失效，無法紀錄送件人 (User is null)');
  }

  // 💡 關鍵偵錯：印出當前抓到的 User ID
  console.log('🕵️ 準備寫入 Workflow Log 的 User ID:', user.id);

  // 2. 寫入日誌
  const { error } = await supabase.from('voucher_workflow_logs').insert({
    voucher_id: voucherId,
    actor_id: user.id,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    reject_reason: rejectReason
  });
  
  if (error) throw error;
}

export async function createVoucher(payload) {
  const {
    txDate, category = '營業', summary, departmentId, currentManagerId,
    projectId, totalAmount, status = 'pending_review',
    detailLines, invoiceLines, attachmentsMap, rows,
    voucherType = '發票', manualNumber = ''
  } = payload;

  const { data: { user } } = await supabase.auth.getUser();
  const voucherNo = resolveVoucherNumber(voucherType, manualNumber, txDate);

  const { data: voucher, error } = await supabase
    .from('vouchers')
    .insert({
      voucher_no: voucherNo,
      tx_date: txDate,
      category,
      summary,
      department_id: departmentId,
      applicant_id: user.id,
      current_manager_id: currentManagerId || null,
      total_amount: totalAmount,
      project_id: projectId && projectId !== 'all' ? projectId : null,
      status: status
      // ⛔ 不要在這裡放 bank_account_id，付款資訊只在會計「歸帳銷案」時才決定
    })
    .select()
    .single();

  if (error) throw error;

  if (detailLines && detailLines.length > 0) {
    // 💡 關鍵偵錯：把前端實際傳進來的資料印出來看（請按 F12 去 Console 查看）
    console.log('🕵️ 前端傳進來的 detailLines 真面目：', JSON.stringify(detailLines, null, 2));

    // 1. 組裝 finalLines，並使用「寬鬆比對」抓取科目代碼
    const finalLines = detailLines.map(l => {
      // 嘗試抓取各種可能的前端命名變數（account_code, accountCode, account...）
      const rawCode = l.account_code ?? l.accountCode ?? l.account ?? l.code ?? null;
      // 確保轉為字串並去除空白
      const cleanCode = (rawCode !== null && rawCode !== undefined) ? String(rawCode).trim() : null;

      return {
        voucher_id: voucher.id,
        description: l.description,
        account_code: cleanCode !== '' ? cleanCode : null, // 確保完全空白會變成 null
        amount: l.amount,
        item_category: l.item_category || null,
        item_category_note: l.item_category_note || null,
        payee_identifier: l.payee_identifier || null,
        payee_name: l.payee_name || null,
        is_proxy_payment: l.is_proxy_payment || false,
        proxy_payer_identifier: l.proxy_payer_identifier || null,
        proxy_payer_name: l.proxy_payer_name || null
      };
    });
    // 2. 嚴格檢查轉換後的結果，如果還是空的，代表前端真的沒把值傳過來
    const missingIndex = finalLines.findIndex(x => !x.account_code);
    if (missingIndex !== -1) {
      throw new Error(`報支單明細第 ${missingIndex + 1} 行缺少「會計科目代碼」。(請工程師按 F12 查看 Console 檢查前端變數名稱是否綁定錯誤)`);
    }

    // 3. 寫入資料庫
    const { error: lineError } = await supabase.from('voucher_lines').insert(finalLines);
    if (lineError) throw lineError;
  }

  if (invoiceLines && invoiceLines.length > 0) {
    const finalInvoices = invoiceLines.map(i => ({
      voucher_id: voucher.id,
      invoice_type: i.invoice_type,
      invoice_number: i.invoice_number || null,
      amount: i.amount,
      tax_amount: i.tax_amount || 0
    }));
    const { error: invoiceError } = await supabase.from('invoices').insert(finalInvoices);
    if (invoiceError) throw invoiceError;
  }

  if (rows && attachmentsMap) {
    const attachmentUploads = Array.from(rows).map(async (row) => {
      const rowId = row.dataset.rowId;
      const file = attachmentsMap[rowId];
      if (!file) return;
      try { await saveAttachment(voucher.id, file); }
      catch (err) { console.error(`第 ${rowId} 列附件上傳失敗：`, err); }
    });
    await Promise.all(attachmentUploads);
  }

  await logWorkflow(voucher.id, 'submit', null, 'pending_review');
  return { success: true, data: voucher };
}

export async function managerApprove(voucher) {
  const { error } = await supabase
    .from('vouchers')
    .update({ status: VOUCHER_STATUS.PENDING_ACCOUNTING, updated_at: new Date().toISOString() })
    .eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'manager_approve', voucher.status, VOUCHER_STATUS.PENDING_ACCOUNTING);
}

export async function managerReject(voucher, reason) {
  const { error } = await supabase
    .from('vouchers')
    .update({ status: VOUCHER_STATUS.MANAGER_REJECTED, updated_at: new Date().toISOString() })
    .eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'manager_reject', voucher.status, VOUCHER_STATUS.MANAGER_REJECTED, reason);
}

export async function accountingApprove(voucher) {
  const { error } = await supabase
    .from('vouchers')
    .update({ status: VOUCHER_STATUS.APPROVED, updated_at: new Date().toISOString() })
    .eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'accounting_approve', voucher.status, VOUCHER_STATUS.APPROVED);

  if (voucher.project_id) {
    const { data: proj } = await supabase
      .from('projects').select('remaining_budget').eq('id', voucher.project_id).single();
    if (proj) {
      const newRemaining = Number(proj.remaining_budget || 0) - Number(voucher.total_amount || 0);
      await supabase.from('projects').update({ remaining_budget: Math.max(0, newRemaining) }).eq('id', voucher.project_id);
    }
  }
}

// 會計退件 → 直接退回申請人
export async function accountingReject(voucher, reason) {
  const { error } = await supabase
    .from('vouchers')
    .update({ 
      status: 'accounting_rejected', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', voucher.id);
  if (error) throw error;

  await logWorkflow(voucher.id, 'reject', voucher.status, 'accounting_rejected', reason);
}

export async function resubmitVoucher(voucher, { summary, amount }) {
  const { error } = await supabase.from('vouchers').update({
    summary, total_amount: amount, status: 'pending_review', updated_at: new Date().toISOString()
  }).eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'resubmit', voucher.status, 'pending_review');
}

// 會計執行歸帳並付款銷案
export async function closeVoucherByAccounting(voucherId, accountCodeId, bankAccountId, paymentDate) {
  try {
    const { data: voucher, error: vError } = await supabase
      .from('vouchers').select('*').eq('id', voucherId).single();
    if (vError) throw vError;
    if (voucher.status !== 'approved') throw new Error('只有已核准的報支單可以執行結案');

    const { data: bank, error: bankFetchError } = await supabase
      .from('bank_accounts').select('balance, opening_balance').eq('id', bankAccountId).single();
    if (bankFetchError) throw bankFetchError;

    const currentBalance = bank.balance ?? bank.opening_balance ?? 0;
    const { error: bankError } = await supabase
      .from('bank_accounts')
      .update({ balance: Number(currentBalance) - Number(voucher.total_amount) })
      .eq('id', bankAccountId);
    if (bankError) throw bankError;

    const { error: jeError } = await supabase.from('journal_entries').insert([{
      voucher_id: voucherId,
      debit_account_id: accountCodeId,
      credit_account_id: (await supabase.from('accounts').select('id').eq('code', '1102').single()).data?.id,
      debit_amount: voucher.total_amount,
      credit_amount: voucher.total_amount,
      entry_date: paymentDate,
      memo: `報支單核銷結案：${voucher.title || voucher.voucher_no}`
    }]);
    if (jeError) throw jeError;

    const { error: updateError } = await supabase
      .from('vouchers')
      .update({ status: 'closed', payment_date: paymentDate, closed_at: new Date().toISOString() })
      .eq('id', voucherId);
    if (updateError) throw updateError;

    return { success: true, message: '歸帳銷案成功' };
  } catch (error) {
    console.error('銷案失敗:', error);
    return { success: false, error: error.message };
  }
}

// 取得使用者的報支單列表
export async function fetchUserVouchers(userId) {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*)')
    .eq('applicant_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// 取得單一報支單詳細資料
export async function fetchVoucherDetail(voucherId) {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .eq('id', voucherId)
    .single();

  if (error) throw error;
  return data;
}