import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment } from './attachments.js';
import { resolveVoucherNumber } from './voucherNumbering.js';
import { VOUCHER_STATUS } from './voucherStatus.js';  // ← 同一資料夾

export async function fetchAccounts() {  let q = supabase.from('accounts').select('*').order('code');  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchBankAccounts() {  let q = supabase.from('bank_accounts').select('*').order('bank_name');  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchDepartments() {  let q = supabase.from('departments').select('*').order('name');  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchMyVouchers() {  let q = supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .order('created_at', { ascending: false });  const { data, error } = await q;
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

// 1. 修正後的 logWorkflow（避免 state 未定義導致崩潰）
async function logWorkflow(voucherId, action, fromStatus, toStatus, reason = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actorId = user?.id || (typeof state !== 'undefined' ? state.currentUser?.id : null);

    let dbAction = action;
    if (action === 'manager_approve' || action === 'accounting_approve') {
      dbAction = 'approve';
    } else if (action === 'manager_reject' || action === 'reject') {
      dbAction = 'reject';
    } else if (action === 'resubmit') {
      dbAction = 'submit';
    }

    const { error } = await supabase.from('voucher_workflow_logs').insert({
      voucher_id: voucherId,
      actor_id: actorId,
      action: dbAction,
      from_status: fromStatus,
      to_status: toStatus,
      reject_reason: reason
    });

    if (error) {
      console.error('寫入 Workflow Log 失敗:', error);
    }
  } catch (err) {
    console.error('logWorkflow 執行異常:', err);
  }
}

// 2. 修正後的 createVoucher（完整支援專案、時程、附件名稱、申請人 ID）
export async function createVoucher(payload) {
  const {
    txDate, category = '營業', summary, departmentId, currentManagerId,
    projectId, totalAmount, status = 'pending_review',
    detailLines, invoiceLines, attachmentsMap, rows,
    voucherType = '发票', manualNumber = '',
    tripStartDate, tripEndDate, applicantId
  } = payload;

  const { data: { user } } = await supabase.auth.getUser();
  const finalApplicantId = applicantId || user?.id;
  const voucherNo = resolveVoucherNumber(voucherType, manualNumber, txDate);

  // 1. 建立主檔（包含專案與時程）
  const { data: voucher, error } = await supabase
    .from('vouchers')
    .insert({
      voucher_no: voucherNo,
      tx_date: txDate,
      category,
      summary,
      department_id: departmentId,
      applicant_id: finalApplicantId,
      current_manager_id: currentManagerId || null,
      total_amount: totalAmount,
      project_id: projectId && projectId !== 'all' ? projectId : null,
      status: status,
      trip_start_date: tripStartDate || null,
      trip_end_date: tripEndDate || null
      ,    })
    .select()
    .single();

  if (error) throw error;

  // 2. 建立明細行（包含附件檔名記錄）
  if (detailLines && detailLines.length > 0) {
    const finalLines = detailLines.map((l, index) => {
      const row = rows ? rows[index] : null;
      const rowId = row?.dataset?.rowId;
      const file = rowId && attachmentsMap ? attachmentsMap[rowId] : null;

      const rawCode = l.account_code ?? l.accountCode ?? l.account ?? l.code ?? null;
      const cleanCode = (rawCode !== null && rawCode !== undefined) ? String(rawCode).trim() : null;

      return {
        voucher_id: voucher.id,
        description: l.description,
        account_code: cleanCode !== '' ? cleanCode : null,
        amount: l.amount,
        item_category: l.item_category || null,
        item_category_note: l.item_category_note || null,
        payee_identifier: l.payee_identifier || null,
        payee_name: l.payee_name || null,
        is_proxy_payment: l.is_proxy_payment || false,
        proxy_payer_identifier: l.proxy_payer_identifier || null,
        proxy_payer_name: l.proxy_payer_name || null,
        attachment_name: file?.name || l.attachment_name || null
      };
    });

    const { error: lineError } = await supabase.from('voucher_lines').insert(finalLines);
    if (lineError) throw lineError;
  }

  // 3. 建立發票明細（確保多筆發票完整存入）
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

  // 4. 上傳實際實體檔案至儲存空間
  if (rows && attachmentsMap) {
    const attachmentUploads = Array.from(rows).map(async (row, index) => {
      const rowId = row.dataset.rowId;
      const file = attachmentsMap[rowId];
      if (!file) return;
      try { await saveAttachment(voucher.id, file); }
      catch (err) { console.error(`第 ${rowId} 列附件上傳失敗：`, err); }
    });
    await Promise.all(attachmentUploads);
  }

  // 5. 寫入審批歷程
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

  if (voucher.project_id) {    const { data: proj } = await supabase
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
  try {    const { data: voucher, error: vError } = await supabase
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

    // 💡 1. 自動判斷傳進來的是 UUID 還是 Code，並查出完整的科目資訊
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountCodeId);
    
    const { data: debitAcc, error: debitAccError } = await supabase
      .from('accounts')
      .select('id, code')
      .filter(isUuid ? 'id' : 'code', 'eq', accountCodeId)
      
      .single();

    if (debitAccError || !debitAcc) {
      throw new Error(`找不到對應的借方會計科目 (${accountCodeId})，請確認科目是否存在。`);
    }

    // 💡 2. 查詢貸方科目 (1102 銀行存款)
    const { data: creditAcc, error: creditAccError } = await supabase
      .from('accounts')
      .select('id, code')
      .eq('code', '1102')
      
      .single();

    if (creditAccError || !creditAcc) {
      throw new Error('找不到貸方預設科目 (1102 銀行存款)，請確認 accounts 資料表是否有此代碼。');
    }

    // 💡 3. 寫入日記帳（同時帶入 id 與 code 確保相容性）
    const { error: jeError } = await supabase.from('journal_entries').insert([{
      voucher_id: voucherId,
      debit_account_id: debitAcc.id,
      debit_account_code: debitAcc.code,
      credit_account_id: creditAcc.id,
      credit_account_code: creditAcc.code,
      debit_amount: voucher.total_amount,
      credit_amount: voucher.total_amount,
      entry_date: paymentDate,
      memo: `報支單核銷結案：${voucher.title || voucher.voucher_no}`
      ,    }]);
    if (jeError) throw jeError;

    const { error: updateError } = await supabase
      .from('vouchers')
      .update({ status: 'closed', payment_date: paymentDate, closed_at: new Date().toISOString() })
      .eq('id', voucherId)
      ;
    if (updateError) throw updateError;

    return { success: true, message: '歸帳銷案成功' };
  } catch (error) {
    console.error('銷案失敗:', error);
    return { success: false, error: error.message };
  }
}

// 取得使用者的報支單列表
export async function fetchUserVouchers(userId) {  let q = supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*)')
    .eq('applicant_id', userId)
    .order('created_at', { ascending: false });  const { data, error } = await q;

  if (error) throw error;
  return data;
}

// 取得單一報支單詳細資料
export async function fetchVoucherDetail(voucherId) {  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .eq('id', voucherId)
    
    .single();

  if (error) throw error;
  return data;
}