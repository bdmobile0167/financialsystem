import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment } from './attachments.js'; // 引入剛改好的 saveAttachment

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
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('voucher_workflow_logs').insert({
    voucher_id: voucherId, actor_id: user.id, action, from_status: fromStatus, to_status: toStatus, reject_reason: rejectReason
  });
  if (error) throw error;
}

export async function createVoucher({ txDate, category, summary, departmentId, line, invoice, payment, projectId, file }) {
  const { data: { user } } = await supabase.auth.getUser();

  const voucherNo = resolveVoucherNumber(invoice.type, invoice.number, txDate);

  // 1. 建立報支單主表
  const { data: voucher, error } = await supabase
    .from('vouchers')
    .insert({
      voucher_no: voucherNo,
      tx_date: txDate,
      category,
      summary,
      department_id: departmentId,
      applicant_id: user.id,
      total_amount: line.amount,
      project_id: projectId,
      status: 'pending_review'
    })
    .select()
    .single();

  if (error) throw error;

  // 2. 寫入明細
  const { error: lineError } = await supabase.from('voucher_lines').insert({
    voucher_id: voucher.id, description: line.description, account_code: line.accountCode, amount: line.amount
  });
  if (lineError) throw lineError;

  // 3. 寫入發票資訊
  const { error: invoiceError } = await supabase.from('invoices').insert({
    voucher_id: voucher.id, invoice_type: invoice.type, invoice_number: invoice.number || null,
    amount: line.amount, tax_amount: 0
  });
  if (invoiceError) throw invoiceError;

  // 4. 寫入付款資訊
  const { error: paymentError } = await supabase.from('voucher_payments').insert({
    voucher_id: voucher.id, payment_type: payment.type,
    bank_account_id: payment.type === 'bank_transfer' ? payment.bankAccountId : null,
    amount: line.amount, paid_at: txDate
  });
  if (paymentError) throw paymentError;

  // 5. 【新增】若有上傳附件檔案，同步上傳並綁定 voucher.id
  if (file) {
    await saveAttachment(voucher.id, file);
  }

  await logWorkflow(voucher.id, 'submit', null, 'pending_review');
  return voucher;
}

export async function managerApprove(voucher) {
  const { error } = await supabase.from('vouchers').update({ status: 'pending_accounting', updated_at: new Date().toISOString() }).eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'approve', voucher.status, 'pending_accounting');
}

// 主管退件 → 直接退回申請人
export async function managerReject(voucher, reason) {
  const { error } = await supabase
    .from('vouchers')
    .update({ 
      status: 'manager_rejected', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', voucher.id);
  if (error) throw error;

  await logWorkflow(voucher.id, 'reject', voucher.status, 'manager_rejected', reason);
}

export async function accountingApprove(voucher) {
  const { error: updateError } = await supabase
    .from('vouchers')
    .update({ 
      status: 'approved', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', voucher.id);

  if (updateError) throw updateError;

  // 🔥 修正 Bug 6：更新銀行帳戶餘額（如果有指定付款銀行）
  if (voucher.bank_account_id) {
    const { error: bankError } = await supabase
      .from('bank_accounts')
      .update({
        // 這裡假設你有 current_balance 欄位，如果沒有請改成 opening_balance + transaction logic
        current_balance: supabase.rpc('deduct_balance', { 
          p_id: voucher.bank_account_id, 
          p_amount: voucher.total_amount 
        })
      })
      .eq('id', voucher.bank_account_id);

    if (bankError) console.warn('銀行餘額更新失敗:', bankError);
  }

  // 扣除專案剩餘預算（之前已教過）
  if (voucher.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('remaining_budget')
      .eq('id', voucher.project_id)
      .single();

    if (proj) {
      const newRemaining = Number(proj.remaining_budget || 0) - Number(voucher.total_amount || 0);
      await supabase
        .from('projects')
        .update({ remaining_budget: Math.max(0, newRemaining) })
        .eq('id', voucher.project_id);
    }
  }

  await logWorkflow(voucher.id, 'approve', voucher.status, 'approved');
}

// 會計退件 → 直接退回申請人（跳過主管）
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
    // 1. 取得 Voucher 金額等資訊
    const { data: voucher, error: vError } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', voucherId)
      .single();
    
    if (vError) throw vError;
    if (voucher.status !== 'approved') throw new Error('只有已核准的報支單可以執行結案');

    // 2. 扣除銀行帳戶餘額 (呼叫你既有的 bank 模組邏輯，或直接 update)
    // 假設有一個 stored procedure 或直接扣減
    const { error: bankError } = await supabase.rpc('deduct_bank_balance', {
      p_bank_id: bankAccountId,
      p_amount: voucher.total_amount
    });
    if (bankError) throw bankError;

    // 3. 建立 Journal Entry (會計分錄) 供報表使用
    const { error: jeError } = await supabase
      .from('journal_entries')
      .insert([{
        voucher_id: voucherId,
        account_id: accountCodeId,
        bank_account_id: bankAccountId,
        amount: voucher.total_amount,
        entry_date: paymentDate,
        description: `報支單核銷結案：${voucher.title || voucher.voucher_no}`
      }]);
    if (jeError) throw jeError;

    // 4. 更新 Voucher 狀態為 closed
    const { error: updateError } = await supabase
      .from('vouchers')
      .update({ 
        status: 'closed',
        payment_date: paymentDate,
        closed_at: new Date().toISOString()
      })
      .eq('id', voucherId);

    if (updateError) throw updateError;

    return { success: true, message: '歸帳銷案成功' };
  } catch (error) {
    console.error('銷案失敗:', error);
    return { success: false, error: error.message };
  }
}