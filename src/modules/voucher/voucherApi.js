import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment, deleteAttachment, deleteAttachmentFiles } from './attachments.js';
import { resolveVoucherNumber } from './voucherNumbering.js';
import { createNotification, createNotificationForMany, getUserIdsByRole } from '../../../scripts/notifications.js';

function normalizeUuidSelection(value) {
  if (!value || value === 'all') return null;
  return value;
}

function buildVoucherLinePayload(lines = []) {
  return (lines || []).map((line) => {
    const rawCode = line.account_code ?? line.accountCode ?? line.account ?? line.code ?? null;
    const cleanCode = rawCode === null || rawCode === undefined ? null : String(rawCode).trim();

    return {
      description: line.description || 'Untitled item',
      account_code: cleanCode ? cleanCode : null,
      amount: Number(line.amount || 0),
      receipt_month: line.receipt_month || null,
      receipt_type: line.receipt_type || null,
      invoice_number: line.invoice_number || null,
      item_category: line.item_category || null,
      item_category_note: line.item_category_note || null,
      payee_identifier: line.payee_identifier || null,
      payee_name: line.payee_name || null,
      is_proxy_payment: Boolean(line.is_proxy_payment),
      proxy_payer_identifier: line.proxy_payer_identifier || null,
      proxy_payer_name: line.proxy_payer_name || null
    };
  });
}

function buildInvoicePayload(lines = []) {
  return (lines || []).map((invoice) => ({
    invoice_type: invoice.invoice_type || null,
    invoice_number: invoice.invoice_number || null,
    amount: Number(invoice.amount || 0),
    tax_amount: Number(invoice.tax_amount || 0)
  }));
}

async function notifyUser(userId, title, body, voucherId) {
  if (!userId) return;
  try {
    await createNotification(userId, title, body, voucherId);
  } catch (error) {
    console.warn('Notification failed.', error.message);
  }
}

async function notifyRoles(role, title, body, voucherId) {
  try {
    const userIds = await getUserIdsByRole(role);
    await createNotificationForMany(userIds, title, body, voucherId);
  } catch (error) {
    console.warn(`Notification for ${role} failed.`, error.message);
  }
}

export async function fetchAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code');

  if (error) throw error;
  return data || [];
}

export async function fetchBankAccounts() {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .order('bank_name');

  if (error) throw error;
  return data || [];
}

export async function fetchDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function fetchMyVouchers() {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchWorkflowLogs(voucherId) {
  const { data, error } = await supabase
    .from('voucher_workflow_logs')
    .select('*, actor:profiles(full_name,email)')
    .eq('voucher_id', voucherId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createVoucher(payload) {
  const {
    txDate,
    category = 'General reimbursement',
    summary,
    departmentId,
    currentManagerId,
    projectId,
    departmentBudgetId,
    totalAmount,
    status = 'pending_review',
    detailLines,
    invoiceLines,
    attachmentsMap,
    rows,
    voucherType = 'system',
    manualNumber = '',
    tripStartDate,
    tripEndDate,
    applicantId
  } = payload;

  const { data: authData } = await supabase.auth.getUser();
  const finalApplicantId = applicantId || authData?.user?.id;
  const voucherNo = resolveVoucherNumber(voucherType, manualNumber, txDate);

  const { data: voucher, error } = await supabase.rpc('create_voucher_with_details', {
    p_voucher: {
      voucher_no: voucherNo,
      tx_date: txDate,
      category,
      summary,
      department_id: departmentId,
      applicant_id: finalApplicantId,
      current_manager_id: currentManagerId || null,
      total_amount: totalAmount,
      project_id: normalizeUuidSelection(projectId),
      department_budget_id: projectId && projectId !== 'all' ? null : normalizeUuidSelection(departmentBudgetId),
      budget_scope: projectId && projectId !== 'all' ? 'project' : 'department',
      status,
      trip_start_date: tripStartDate || null,
      trip_end_date: tripEndDate || null
    },
    p_lines: buildVoucherLinePayload(detailLines || []),
    p_invoices: buildInvoicePayload(invoiceLines || [])
  });

  if (error) throw error;

  if (rows && attachmentsMap) {
    const uploads = Array.from(rows).map(async (row) => {
      const rowId = row.dataset.rowId;
      const file = attachmentsMap[rowId];
      if (!file) return null;
      try {
        return await saveAttachment(voucher.id, file);
      } catch (uploadError) {
        console.error(`Attachment upload failed: ${file?.name || rowId}`, uploadError);
        return null;
      }
    });
    await Promise.all(uploads);
  }

  await notifyUser(
    currentManagerId,
    'New voucher pending review',
    `${summary || voucherNo}, amount $${Number(totalAmount || 0).toLocaleString()}`,
    voucher.id
  );

  return { success: true, data: voucher };
}

export async function managerApprove(voucher) {
  const { data, error } = await supabase.rpc('approve_voucher_by_manager', {
    p_voucher_id: voucher.id
  });

  if (error) throw error;
  if (!data) throw new Error('Manager approval failed. Check voucher status and permissions.');

  const { data: full } = await supabase
    .from('vouchers')
    .select('voucher_no, summary, total_amount')
    .eq('id', voucher.id)
    .single();

  await notifyRoles(
    'accounting',
    'Voucher approved; pending accounting review',
    `${full?.summary || full?.voucher_no || ''}, amount $${Number(full?.total_amount || 0).toLocaleString()}`,
    voucher.id
  );
}

export async function managerReject(voucher, reason) {
  const { data, error } = await supabase.rpc('reject_voucher_by_manager', {
    p_voucher_id: voucher.id,
    p_reason: reason || null
  });

  if (error) throw error;
  if (!data) throw new Error('Manager rejection failed. Check voucher status and permissions.');

  const { data: full } = await supabase
    .from('vouchers')
    .select('applicant_id, voucher_no, summary')
    .eq('id', voucher.id)
    .single();

  await notifyUser(
    full?.applicant_id,
    'Voucher rejected by manager',
    `${full?.summary || full?.voucher_no || ''}${reason ? `: ${reason}` : ''}`,
    voucher.id
  );
}

export async function accountingApprove(voucher, options = {}) {
  const {
    lineAssignments = [],
    accountingAccountId = null,
    paymentRecipientId = null,
    accountingNote = null
  } = options;

  const { data: approvedVoucher, error } = await supabase.rpc('approve_voucher_review_by_accounting', {
    p_voucher_id: voucher.id,
    p_line_assignments: lineAssignments,
    p_accounting_account_id: accountingAccountId,
    p_payment_recipient_id: paymentRecipientId,
    p_accounting_note: accountingNote
  });

  if (error) throw error;
  if (!approvedVoucher) throw new Error('Accounting approval failed. Check voucher status and permissions.');

  const { data: full } = await supabase
    .from('vouchers')
    .select('applicant_id, voucher_no, summary')
    .eq('id', voucher.id)
    .single();

  await notifyUser(
    full?.applicant_id,
    'Voucher completed accounting review',
    `${full?.summary || full?.voucher_no || ''}`,
    voucher.id
  );
}

export async function accountingReject(voucher, reason) {
  const { data, error } = await supabase.rpc('reject_voucher_by_accounting', {
    p_voucher_id: voucher.id,
    p_reason: reason || null
  });

  if (error) throw error;
  if (!data) throw new Error('Accounting rejection failed. Check voucher status and permissions.');

  const { data: full } = await supabase
    .from('vouchers')
    .select('applicant_id, voucher_no, summary')
    .eq('id', voucher.id)
    .single();

  await notifyUser(
    full?.applicant_id,
    'Voucher rejected by accounting',
    `${full?.summary || full?.voucher_no || ''}${reason ? `: ${reason}` : ''}`,
    voucher.id
  );
}

export async function resubmitVoucher(voucher, { summary, amount }) {
  const { error } = await supabase.rpc('resubmit_voucher', {
    p_voucher_id: voucher.id,
    p_summary: summary,
    p_total_amount: amount
  });

  if (error) throw error;
}

export async function updateVoucher(voucherId, payload) {
  const {
    txDate,
    category,
    summary,
    departmentId,
    currentManagerId,
    projectId,
    departmentBudgetId,
    totalAmount,
    status,
    detailLines,
    invoiceLines,
    tripStartDate,
    tripEndDate,
    newAttachments,
    deleteAttachmentIds
  } = payload;

  const updateData = {};
  if (txDate !== undefined) updateData.tx_date = txDate;
  if (category !== undefined) updateData.category = category;
  if (summary !== undefined) updateData.summary = summary;
  if (departmentId !== undefined) updateData.department_id = departmentId;
  if (currentManagerId !== undefined) updateData.current_manager_id = currentManagerId || null;
  if (projectId !== undefined) {
    updateData.project_id = normalizeUuidSelection(projectId);
    updateData.budget_scope = projectId && projectId !== 'all' ? 'project' : 'department';
    updateData.department_budget_id = projectId && projectId !== 'all' ? null : normalizeUuidSelection(departmentBudgetId);
  } else if (departmentBudgetId !== undefined) {
    updateData.project_id = null;
    updateData.department_budget_id = normalizeUuidSelection(departmentBudgetId);
    updateData.budget_scope = 'department';
  }
  if (totalAmount !== undefined) updateData.total_amount = totalAmount;
  if (status !== undefined) updateData.status = status;
  if (tripStartDate !== undefined) updateData.trip_start_date = tripStartDate || null;
  if (tripEndDate !== undefined) updateData.trip_end_date = tripEndDate || null;

  const { error } = await supabase.rpc('update_voucher_with_details', {
    p_voucher_id: voucherId,
    p_voucher_patch: updateData,
    p_lines: detailLines !== undefined ? buildVoucherLinePayload(detailLines) : null,
    p_invoices: invoiceLines !== undefined ? buildInvoicePayload(invoiceLines) : null
  });

  if (error) throw error;

  if (deleteAttachmentIds?.length) {
    for (const attachmentId of deleteAttachmentIds) {
      await deleteAttachment(attachmentId).catch((deleteError) => {
        console.warn(`Attachment deletion failed: ${attachmentId}`, deleteError.message);
      });
    }
  }

  if (newAttachments?.length) {
    for (const file of newAttachments) {
      await saveAttachment(voucherId, file).catch((uploadError) => {
        console.error(`Attachment upload failed: ${file?.name || 'unnamed attachment'}`, uploadError);
      });
    }
  }

  return { success: true, message: 'Voucher updated.' };
}

export async function deleteVoucher(voucherId) {
  const { data, error } = await supabase.rpc('delete_voucher_cascade', {
    p_voucher_id: voucherId
  });

  if (error) throw error;

  const attachmentPaths = Array.isArray(data?.attachment_paths) ? data.attachment_paths : [];
  let storageWarning = '';
  if (attachmentPaths.length) {
    try {
      await deleteAttachmentFiles(attachmentPaths);
    } catch (cleanupError) {
      console.warn('Storage attachment cleanup failed after voucher deletion.', cleanupError.message);
      storageWarning = ' Attachment file deletion failed, but database records were deleted.';
    }
  }

  return {
    success: true,
    message: `Voucher and related records deleted.${storageWarning}`,
    result: data
  };
}

export async function closeVoucherByAccounting(voucherId, accountCodeId, bankAccountId, paymentDate) {
  try {
    const { data: result, error } = await supabase.rpc('close_voucher_by_accounting', {
      p_voucher_id: voucherId,
      p_debit_account: accountCodeId,
      p_bank_account_id: bankAccountId,
      p_payment_date: paymentDate
    });

    if (error) throw error;

    return {
      success: true,
      message: result?.idempotent ? 'Payment is already closed.' : 'Payment completed and closed.'
    };
  } catch (error) {
    console.error('Payment close failed:', error);
    return { success: false, error: error.message };
  }
}

export async function fetchUserVouchers(userId) {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*)')
    .eq('applicant_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchVoucherDetail(voucherId) {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .eq('id', voucherId)
    .single();

  if (error) throw error;
  return data;
}
