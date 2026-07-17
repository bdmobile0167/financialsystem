import { supabase } from '../../../scripts/supabaseClient.js';

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

export async function createVoucher({ txDate, category, summary, departmentId, line, invoice, payment, projectId }) {
  const { data: { user } } = await supabase.auth.getUser();

  const voucherNo = resolveVoucherNumber(invoice.type, invoice.number, txDate);

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

  const { error: lineError } = await supabase.from('voucher_lines').insert({
    voucher_id: voucher.id, description: line.description, account_code: line.accountCode, amount: line.amount
  });
  if (lineError) throw lineError;

  const { error: invoiceError } = await supabase.from('invoices').insert({
    voucher_id: voucher.id, invoice_type: invoice.type, invoice_number: invoice.number || null,
    amount: line.amount, tax_amount: 0
  });
  if (invoiceError) throw invoiceError;

  const { error: paymentError } = await supabase.from('voucher_payments').insert({
    voucher_id: voucher.id, payment_type: payment.type,
    bank_account_id: payment.type === 'bank_transfer' ? payment.bankAccountId : null,
    amount: line.amount, paid_at: txDate
  });
  if (paymentError) throw paymentError;

  await logWorkflow(voucher.id, 'submit', null, 'pending_review');
  return voucher;
}

export async function managerApprove(voucher) {
  const { error } = await supabase.from('vouchers').update({ status: 'pending_accounting', updated_at: new Date().toISOString() }).eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'approve', voucher.status, 'pending_accounting');
}

export async function managerReject(voucher, reason) {
  const { error } = await supabase.from('vouchers').update({ status: 'manager_rejected', updated_at: new Date().toISOString() }).eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'reject', voucher.status, 'manager_rejected', reason);
}

export async function accountingApprove(voucher) {
  const { error } = await supabase.from('vouchers').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'approve', voucher.status, 'approved');
}

export async function accountingReject(voucher, reason) {
  const { error } = await supabase.from('vouchers').update({ status: 'accounting_rejected', updated_at: new Date().toISOString() }).eq('id', voucher.id);
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