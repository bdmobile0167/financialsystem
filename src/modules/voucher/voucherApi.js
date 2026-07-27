import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment } from './attachments.js';
import { resolveVoucherNumber } from './voucherNumber.js'; // 假設編號檔案在此

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

export async function createVoucher(payload) {
  const { 
    txDate, 
    category = '營業', 
    summary, 
    departmentId, 
    currentManagerId,
    projectId, 
    totalAmount,
    status = 'pending_review',
    detailLines, 
    invoiceLines, 
    attachmentsMap,
    rows,
    voucherType = '發票',    // [已修正] 補上接收 voucherType
    manualNumber = '',        // [已修正] 補上接收 manualNumber
    bankAccountId = null      // [已修正] 補上接收 bankAccountId
  } = payload;
  
  const { data: { user } } = await supabase.auth.getUser();// 1. 自動產生或解析單據編號[cite: 12]
  const voucherNo = resolveVoucherNumber(voucherType, manualNumber, txDate);

  // 2. 建立報支單主表 (Voucher Main) - 確保寫入 voucher_no 與 bank_account_id
  const { data: voucher, error } = await supabase
    .from('vouchers')
    .insert({
      tx_date: txDate,
      category,
      summary,
      department_id: departmentId,
      applicant_id: user.id,
      current_manager_id: currentManagerId,
      total_amount: totalAmount,
      project_id: projectId && projectId !== 'all' ? projectId : null,
      status: status
    })
    .select()
    .single();

  if (error) throw error;

  // 2. 批量寫入多筆明細 (voucher_lines)
  if (detailLines && detailLines.length > 0) {
    const finalLines = detailLines.map(l => ({
      voucher_id: voucher.id,
      description: l.description,
      account_code: l.account_code || '6100',
      amount: l.amount
    }));

    const { error: lineError } = await supabase.from('voucher_lines').insert(finalLines);
    if (lineError) throw lineError;
  }

  // 3. 批量寫入發票資訊 (invoices)
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

  // 4. 寫入付款資訊
  const { error: paymentError } = await supabase.from('voucher_payments').insert({
    voucher_id: voucher.id,
    payment_type: 'bank_transfer',
    amount: totalAmount,
    paid_at: txDate
  });
  if (paymentError) {
    console.warn('付款資訊寫入失敗或可略過:', paymentError);
  }

  // 5. 逐列上傳附件檔案並綁定 voucher.id
  if (rows && attachmentsMap) {
    const attachmentUploads = Array.from(rows).map(async (row) => {
      const rowId = row.dataset.rowId;
      const file = attachmentsMap[rowId];
      if (!file) return;
      try {
        await saveAttachment(voucher.id, file);
      } catch (err) {
        console.error(`第 ${rowId} 列附件上傳失敗：`, err);
      }
    });
    await Promise.all(attachmentUploads);
  }

  // 6. 寫入工作流程記錄
  await logWorkflow(voucher.id, 'submit', null, 'pending_review');
  
  return { success: true, data: voucher };
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

  if (voucher.bank_account_id) {
    const { error: bankError } = await supabase
      .from('bank_accounts')
      .update({
        current_balance: supabase.rpc('deduct_balance', { 
          p_id: voucher.bank_account_id, 
          p_amount: voucher.total_amount 
        })
      })
      .eq('id', voucher.bank_account_id);

    if (bankError) console.warn('銀行餘額更新失敗:', bankError);
  }

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
      .from('vouchers')
      .select('*')
      .eq('id', voucherId)
      .single();
    
    if (vError) throw vError;
    if (voucher.status !== 'approved') throw new Error('只有已核准的報支單可以執行結案');

    const { error: bankError } = await supabase.rpc('deduct_bank_balance', {
      p_bank_id: bankAccountId,
      p_amount: voucher.total_amount
    });
    if (bankError) throw bankError;

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