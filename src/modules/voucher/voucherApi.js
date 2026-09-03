import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment, deleteAttachment, deleteAttachmentFiles } from './attachments.js';
import { resolveVoucherNumber } from './voucherNumbering.js';
import { VOUCHER_STATUS } from './voucherStatus.js';  // ????鞈?憭?
import { createNotification, createNotificationForMany, getUserIdsByRole } from '../../../scripts/notifications.js';

export async function fetchAccounts() {  let q = supabase.from('accounts').select('*').order('code');  const { data, error } = await q;
  if (error) throw error;
  return data || [];
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

// 1. 靽格迤敺? logWorkflow嚗??state ?芸?蝢拙??游援瞏堆?
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
      console.error('撖怠 Workflow Log 憭望?:', error);
    }
  } catch (err) {
    console.error('logWorkflow ?瑁??啣虜:', err);
  }
}

// 2. 靽格迤敺? createVoucher嚗??湔?游?獢?蝔?隞嗅?蝔晞隢犖 ID嚗?
function normalizeUuidSelection(value) {
  if (!value || value === 'all') return null;
  return value;
}

function buildVoucherLinePayload(lines = []) {
  return (lines || []).map(l => {
    const rawCode = l.account_code ?? l.accountCode ?? l.account ?? l.code ?? null;
    const cleanCode = (rawCode !== null && rawCode !== undefined) ? String(rawCode).trim() : null;

    return {
      description: l.description,
      account_code: cleanCode !== '' ? cleanCode : null,
      amount: l.amount,
      receipt_month: l.receipt_month || null,
      receipt_type: l.receipt_type || null,
      invoice_number: l.invoice_number || null,
      item_category: l.item_category || null,
      item_category_note: l.item_category_note || null,
      payee_identifier: l.payee_identifier || null,
      payee_name: l.payee_name || null,
      is_proxy_payment: l.is_proxy_payment || false,
      proxy_payer_identifier: l.proxy_payer_identifier || null,
      proxy_payer_name: l.proxy_payer_name || null
    };
  });
}

function buildInvoicePayload(lines = []) {
  return (lines || []).map(i => ({
    invoice_type: i.invoice_type,
    invoice_number: i.invoice_number || null,
    amount: i.amount,
    tax_amount: i.tax_amount || 0
  }));
}

export async function createVoucher(payload) {
  const {
    txDate, category = '?平', summary, departmentId, currentManagerId,
    projectId, departmentBudgetId, totalAmount, status = 'pending_review',
    detailLines, invoiceLines, attachmentsMap, rows,
    voucherType = '?巨', manualNumber = '',
    tripStartDate, tripEndDate, applicantId
  } = payload;

  const { data: { user } } = await supabase.auth.getUser();
  const finalApplicantId = applicantId || user?.id;
  const voucherNo = resolveVoucherNumber(voucherType, manualNumber, txDate);

  // 1. 撱箇?銝餅?嚗??怠?獢???嚗?
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
      status: status,
      trip_start_date: tripStartDate || null,
      trip_end_date: tripEndDate || null
    },
    p_lines: buildVoucherLinePayload(detailLines || []),
    p_invoices: buildInvoicePayload(invoiceLines || [])
  });

  if (error) throw error;

  // 2. 撱箇??敦銵???辣瑼?閮?嚗?
  // 3. 撱箇??潛巨?敦嚗Ⅱ靽?蝑蟡典??游??伐?
  // 4. 銝撖阡?撖阡?瑼??喳摮征??
  if (rows && attachmentsMap) {
    const attachmentUploads = Array.from(rows).map(async (row, index) => {
      const rowId = row.dataset.rowId;
      const file = attachmentsMap[rowId];
      if (!file) return;
      try { await saveAttachment(voucher.id, file); }
      catch (err) { console.error(`蝚?${rowId} ??隞嗡??喳仃??`, err); }
    });
    await Promise.all(attachmentUploads);
  }

  // 5. 撖怠撖拇甇瑞?

  // 6. ?銝餌恣??桀?撖拇
  if (currentManagerId) {
    await createNotification(
      currentManagerId,
      '您有一張新的傳票待審核',
      `${summary || voucherNo}，金額：$${Number(totalAmount).toLocaleString()}`,
      voucher.id
    );
  }

  return { success: true, data: voucher };
}

export async function managerApprove(voucher) {
  // ?具?摮扳?隞嗆?啜甇ａ?銴????芣??桀??????pending_review ????唳???
  // ?亙歇鋡怨???嚗?憒蝙?刻??憭活嚗??ㄐ??征???嚗??銴孛?澆?蝥?雿?
  const { data, error } = await supabase.rpc('approve_voucher_by_manager', {
    p_voucher_id: voucher.id
  });
  if (error) throw error;
  if (!data) {
    throw new Error('操作失敗：可能已被處理過，請重新整理頁面後再試');
  }
  // ????閮犖?∴????甇詨董
  const { data: full } = await supabase.from('vouchers').select('voucher_no, summary, total_amount').eq('id', voucher.id).single();
  const accountingUserIds = await getUserIdsByRole('accounting');
  await createNotificationForMany(
    accountingUserIds,
    '有新的傳票待會計審核',
    `${full?.summary || full?.voucher_no || ''}，金額：$${Number(full?.total_amount || 0).toLocaleString()}`,
    voucher.id
  );
}

export async function managerReject(voucher, reason) {
  const { data, error } = await supabase.rpc('reject_voucher_by_manager', {
    p_voucher_id: voucher.id,
    p_reason: reason || null
  });
  if (error) throw error;
  if (!data) {
    throw new Error('操作失敗：可能已被處理過，請重新整理頁面後再試');
  }
  const { data: full } = await supabase.from('vouchers').select('applicant_id, voucher_no, summary').eq('id', voucher.id).single();
  if (full?.applicant_id) {
    await createNotification(
      full.applicant_id,
      '您的傳票已被主管退回',
      `${full.summary || full.voucher_no || ''}${reason ? '，理由：' + reason : ''}`,
      voucher.id
    );
  }
}

export async function accountingApprove(voucher, options = {}) {
  // ?具?摮扳?隞嗆?啜甇ａ?銴??????澆嚗???????pending_accounting ????唳???
  // ??踹???撘萄?????憭活??銴?文?獢?蝞?銴神?交風蝔????
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
  if (!approvedVoucher) {
    throw new Error('操作失敗：可能已被處理過，請重新整理頁面後再試');
  }
  const { data: full } = await supabase.from('vouchers').select('applicant_id, voucher_no, summary').eq('id', voucher.id).single();
  if (full?.applicant_id) {
    await createNotification(
      full.applicant_id,
      '您的傳票已審核完成，款項將盡快撥付',
      `${full.summary || full.voucher_no || ''}`,
      voucher.id
    );
  }
}

// ???隞????湔??隢犖
export async function accountingReject(voucher, reason) {
  const { data, error } = await supabase.rpc('reject_voucher_by_accounting', {
    p_voucher_id: voucher.id,
    p_reason: reason || null
  });
  if (error) throw error;
  if (!data) {
    throw new Error('操作失敗：可能已被處理過，請重新整理頁面後再試');
  }
  const { data: full } = await supabase.from('vouchers').select('applicant_id, voucher_no, summary').eq('id', voucher.id).single();
  if (full?.applicant_id) {
    await createNotification(
      full.applicant_id,
      '您的傳票已被會計退回',
      `${full.summary || full.voucher_no || ''}${reason ? '，理由：' + reason : ''}`,
      voucher.id
    );
  }
}

export async function resubmitVoucher(voucher, { summary, amount }) {
  const { error } = await supabase.rpc('resubmit_voucher', {
    p_voucher_id: voucher.id,
    p_summary: summary,
    p_total_amount: amount
  });
  if (error) throw error;
}

/**
 * ?湔??嚗耨?嫣蜓瑼?蝝啗??蟡剁???
 * 蝑嚗??芷????蝝啗?/?潛巨嚗?????
 * 瘜冽?嚗迨?賢?銝???隞嗡??喉??辣隢 saveAttachment() ?函?????
 */
export async function updateVoucher(voucherId, payload) {
  const {
    txDate, category, summary, departmentId, currentManagerId,
    projectId, departmentBudgetId, totalAmount, status,
    detailLines, invoiceLines,
    voucherType, manualNumber,
    tripStartDate, tripEndDate,
    // ?辣??嚗???蝺刻摩?剁?
    newAttachments,        // [] File ???銝??辣
    deleteAttachmentIds     // [] id ????芷???隞?
  } = payload;

  // 1. ?湔銝餅?
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
  const { error: updateError } = await supabase.rpc('update_voucher_with_details', {
    p_voucher_id: voucherId,
    p_voucher_patch: updateData,
    p_lines: detailLines !== undefined ? buildVoucherLinePayload(detailLines) : null,
    p_invoices: invoiceLines !== undefined ? buildInvoicePayload(invoiceLines) : null
  });
  if (updateError) throw updateError;

  // 3.5 ?辣??嚗?斗?摰?隞?
  if (deleteAttachmentIds && deleteAttachmentIds.length > 0) {
    for (const attId of deleteAttachmentIds) {
      try {
        await deleteAttachment(attId);
      } catch (err) {
        console.warn(`?芷?辣 ${attId} 憭望?嚗歇頝喲?嚗?`, err.message);
      }
    }
  }

  // 3.6 ?辣??嚗??單?辣
  if (newAttachments && newAttachments.length > 0) {
    for (const file of newAttachments) {
      try {
        await saveAttachment(voucherId, file);
      } catch (err) {
        console.error(`?圈?隞嗡??喳仃??${file?.name || '?芰瑼?'}嚗?`, err);
      }
    }
  }

  return { success: true, message: 'Voucher updated successfully.' };
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
    } catch (err) {
      console.warn('Storage attachment cleanup failed after voucher deletion.', err.message);
      storageWarning = ' Storage attachment cleanup failed; database records were deleted.';
    }
  }

  return {
    success: true,
    message: `Voucher and related database records deleted.${storageWarning}`,
    result: data
  };
}

// ???瑁?甇詨董銝虫?甈暸獢?
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
      message: result?.idempotent ? '甇文?歇摰?甇詨董?瑟?' : '甇詨董?瑟???'
    };
  } catch (error) {
    console.error('?瑟?憭望?:', error);
    return { success: false, error: error.message };
  }
}

// ??雿輻???望?桀?銵?
export async function fetchUserVouchers(userId) {  let q = supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*)')
    .eq('applicant_id', userId)
    .order('created_at', { ascending: false });  const { data, error } = await q;

  if (error) throw error;
  return data;
}

// ???桐??望?株底蝝啗???
export async function fetchVoucherDetail(voucherId) {  const { data, error } = await supabase
    .from('vouchers')
    .select('*, voucher_lines(*), invoices(*), voucher_payments(*)')
    .eq('id', voucherId)
    
    .single();

  if (error) throw error;
  return data;
}
