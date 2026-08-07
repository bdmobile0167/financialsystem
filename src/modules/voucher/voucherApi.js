import { supabase } from '../../../scripts/supabaseClient.js';
import { saveAttachment, deleteAttachment } from './attachments.js';
import { resolveVoucherNumber } from './voucherNumbering.js';
import { VOUCHER_STATUS } from './voucherStatus.js';  // ← 同一資料夾
import { createNotification, createNotificationForMany, getUserIdsByRole } from '../../../scripts/notifications.js';

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
        proxy_payer_name: l.proxy_payer_name || null
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

  // 6. 通知主管有新單待審核
  if (currentManagerId) {
    await createNotification(
      currentManagerId,
      '有新的報支單待審核',
      `${summary || voucherNo} － 金額 $${Number(totalAmount).toLocaleString()}`,
      voucher.id
    );
  }

  return { success: true, data: voucher };
}

export async function managerApprove(voucher) {
  const { error } = await supabase
    .from('vouchers')
    .update({ status: VOUCHER_STATUS.PENDING_ACCOUNTING, updated_at: new Date().toISOString() })
    .eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'manager_approve', voucher.status, VOUCHER_STATUS.PENDING_ACCOUNTING);

  // 通知所有會計人員：有單據待歸帳
  const { data: full } = await supabase.from('vouchers').select('voucher_no, summary, total_amount').eq('id', voucher.id).single();
  const accountingUserIds = await getUserIdsByRole('accounting');
  await createNotificationForMany(
    accountingUserIds,
    '有報支單待會計審核',
    `${full?.summary || full?.voucher_no || ''} － 金額 $${Number(full?.total_amount || 0).toLocaleString()}`,
    voucher.id
  );
}

export async function managerReject(voucher, reason) {
  const { error } = await supabase
    .from('vouchers')
    .update({ status: VOUCHER_STATUS.MANAGER_REJECTED, updated_at: new Date().toISOString() })
    .eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'manager_reject', voucher.status, VOUCHER_STATUS.MANAGER_REJECTED, reason);

  const { data: full } = await supabase.from('vouchers').select('applicant_id, voucher_no, summary').eq('id', voucher.id).single();
  if (full?.applicant_id) {
    await createNotification(
      full.applicant_id,
      '您的報支單已被主管退回',
      `${full.summary || full.voucher_no || ''}${reason ? '：' + reason : ''}`,
      voucher.id
    );
  }
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

  const { data: full } = await supabase.from('vouchers').select('applicant_id, voucher_no, summary').eq('id', voucher.id).single();
  if (full?.applicant_id) {
    await createNotification(
      full.applicant_id,
      '您的報支單已核准，待付款',
      `${full.summary || full.voucher_no || ''}`,
      voucher.id
    );
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

  const { data: full } = await supabase.from('vouchers').select('applicant_id, voucher_no, summary').eq('id', voucher.id).single();
  if (full?.applicant_id) {
    await createNotification(
      full.applicant_id,
      '您的報支單已被會計退回',
      `${full.summary || full.voucher_no || ''}${reason ? '：' + reason : ''}`,
      voucher.id
    );
  }
}

export async function resubmitVoucher(voucher, { summary, amount }) {
  const { error } = await supabase.from('vouchers').update({
    summary, total_amount: amount, status: 'pending_review', updated_at: new Date().toISOString()
  }).eq('id', voucher.id);
  if (error) throw error;
  await logWorkflow(voucher.id, 'resubmit', voucher.status, 'pending_review');
}

/**
 * 更新憑證（修改主檔、明細行、發票）。
 * 策略：先刪除所有既有明細行/發票，再重新插入。
 * 注意：此函式不處理附件上傳，附件請用 saveAttachment() 獨立處理。
 */
export async function updateVoucher(voucherId, payload) {
  const {
    txDate, category, summary, departmentId, currentManagerId,
    projectId, totalAmount, status,
    detailLines, invoiceLines,
    voucherType, manualNumber,
    tripStartDate, tripEndDate,
    // 附件處理（重送／編輯用）
    newAttachments,        // [] File — 需上傳的新附件
    deleteAttachmentIds     // [] id — 需刪除的既有附件
  } = payload;

  // 1. 更新主檔
  const updateData = {};
  if (txDate !== undefined) updateData.tx_date = txDate;
  if (category !== undefined) updateData.category = category;
  if (summary !== undefined) updateData.summary = summary;
  if (departmentId !== undefined) updateData.department_id = departmentId;
  if (currentManagerId !== undefined) updateData.current_manager_id = currentManagerId || null;
  if (projectId !== undefined) updateData.project_id = (projectId && projectId !== 'all') ? projectId : null;
  if (totalAmount !== undefined) updateData.total_amount = totalAmount;
  if (status !== undefined) updateData.status = status;
  if (tripStartDate !== undefined) updateData.trip_start_date = tripStartDate || null;
  if (tripEndDate !== undefined) updateData.trip_end_date = tripEndDate || null;
  updateData.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('vouchers')
    .update(updateData)
    .eq('id', voucherId);
  if (updateError) throw updateError;

  // 2. 更新明細行（刪除舊行 → 插入新行）
  if (detailLines !== undefined) {
    // 刪除舊明細
    const { error: deleteLinesError } = await supabase
      .from('voucher_lines')
      .delete()
      .eq('voucher_id', voucherId);
    if (deleteLinesError) throw deleteLinesError;

    // 插入新明細
    if (detailLines.length > 0) {
      const newLines = detailLines.map(l => {
        const rawCode = l.account_code ?? l.accountCode ?? l.account ?? l.code ?? null;
        const cleanCode = (rawCode !== null && rawCode !== undefined) ? String(rawCode).trim() : null;
        return {
          voucher_id: voucherId,
          description: l.description,
          account_code: cleanCode !== '' ? cleanCode : null,
          amount: l.amount,
          item_category: l.item_category || null,
          item_category_note: l.item_category_note || null,
          receipt_month: l.receipt_month || null,
          payee_identifier: l.payee_identifier || null,
          payee_name: l.payee_name || null,
          is_proxy_payment: l.is_proxy_payment || false,
          proxy_payer_identifier: l.proxy_payer_identifier || null,
          proxy_payer_name: l.proxy_payer_name || null
        };
      });
      const { error: insertLinesError } = await supabase.from('voucher_lines').insert(newLines);
      if (insertLinesError) throw insertLinesError;
    }
  }

  // 3. 更新發票明細（刪除舊發票 → 插入新發票）
  if (invoiceLines !== undefined) {
    const { error: deleteInvError } = await supabase
      .from('invoices')
      .delete()
      .eq('voucher_id', voucherId);
    if (deleteInvError) throw deleteInvError;

    if (invoiceLines.length > 0) {
      const newInvoices = invoiceLines.map(i => ({
        voucher_id: voucherId,
        invoice_type: i.invoice_type,
        invoice_number: i.invoice_number || null,
        amount: i.amount,
        tax_amount: i.tax_amount || 0
      }));
      const { error: insertInvError } = await supabase.from('invoices').insert(newInvoices);
      if (insertInvError) throw insertInvError;
    }
  }

  // 3.5 附件處理：刪除指定附件
  if (deleteAttachmentIds && deleteAttachmentIds.length > 0) {
    for (const attId of deleteAttachmentIds) {
      try {
        await deleteAttachment(attId);
      } catch (err) {
        console.warn(`刪除附件 ${attId} 失敗（已跳過）:`, err.message);
      }
    }
  }

  // 3.6 附件處理：上傳新附件
  if (newAttachments && newAttachments.length > 0) {
    for (const file of newAttachments) {
      try {
        await saveAttachment(voucherId, file);
      } catch (err) {
        console.error(`新附件上傳失敗（${file?.name || '未知檔案'}）:`, err);
      }
    }
  }

  return { success: true, message: '憑證已更新。' };
}

/**
 * 刪除憑證（含明細行、發票、附件、付款記錄、workflow logs）。
 * 會一併刪除 Storage 中的附件實體檔案。
 */
export async function deleteVoucher(voucherId) {
  // 1. 刪除附件（先取得所有附件紀錄，逐一刪除 Storage 檔案）
  const { data: attachments } = await supabase
    .from('voucher_attachments')
    .select('id, file_path, file_url')
    .eq('voucher_id', voucherId);
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      try {
        await deleteAttachment(att.id, att.file_path);
      } catch (err) {
        console.warn(`刪除附件 ${att.id} 時發生錯誤（已跳過）:`, err.message);
      }
    }
  }

  // 2. 刪除明細行
  const { error: delLinesError } = await supabase
    .from('voucher_lines')
    .delete()
    .eq('voucher_id', voucherId);
  if (delLinesError) console.warn('刪除 voucher_lines 失敗:', delLinesError.message);

  // 3. 刪除發票
  const { error: delInvError } = await supabase
    .from('invoices')
    .delete()
    .eq('voucher_id', voucherId);
  if (delInvError) console.warn('刪除 invoices 失敗:', delInvError.message);

  // 4. 刪除付款記錄
  const { error: delPayError } = await supabase
    .from('voucher_payments')
    .delete()
    .eq('voucher_id', voucherId);
  if (delPayError) console.warn('刪除 voucher_payments 失敗:', delPayError.message);

  // 5. 刪除 workflow logs
  const { error: delLogError } = await supabase
    .from('voucher_workflow_logs')
    .delete()
    .eq('voucher_id', voucherId);
  if (delLogError) console.warn('刪除 voucher_workflow_logs 失敗:', delLogError.message);

  // 6. 刪除銀行交易紀錄（若有關聯）
  const { error: delBankTxError } = await supabase
    .from('bank_transactions')
    .delete()
    .eq('voucher_id', voucherId);
  if (delBankTxError) console.warn('刪除 bank_transactions 失敗:', delBankTxError.message);

  // 7. 刪除日記帳分錄
  const { error: delJEError } = await supabase
    .from('journal_entries')
    .delete()
    .eq('voucher_id', voucherId);
  if (delJEError) console.warn('刪除 journal_entries 失敗:', delJEError.message);

  // 8. 最後刪除憑證主檔
  const { error: delVoucherError } = await supabase
    .from('vouchers')
    .delete()
    .eq('id', voucherId);
  if (delVoucherError) throw delVoucherError;

  return { success: true, message: '憑證已徹底刪除（含附件、明細、發票、分錄、付款記錄）。' };
}

// 會計執行歸帳並付款銷案
export async function closeVoucherByAccounting(voucherId, accountCodeId, bankAccountId, paymentDate) {
  try {    const { data: voucher, error: vError } = await supabase
      .from('vouchers').select('*').eq('id', voucherId).single();
    if (vError) throw vError;
    if (voucher.status !== 'approved') throw new Error('只有已核准的報支單可以執行結案');

    // balance 為資料庫 GENERATED 欄位（= opening_balance），無法直接 update；
    // 銀行餘額改由「銀行流水 bank_transactions」動態加總得出，這裡寫入一筆支出流水即可
    const { error: bankTxError } = await supabase.from('bank_transactions').insert({
      bank_account_id: bankAccountId,
      tx_date: paymentDate,
      type: '支出',
      amount: voucher.total_amount,
      voucher_id: voucherId,
      description: `報支單核銷結案：${voucher.summary || voucher.voucher_no}`
    });
    if (bankTxError) throw bankTxError;

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
      credit_account_id: creditAcc.id,
      debit_amount: voucher.total_amount,
      credit_amount: voucher.total_amount,
      entry_date: paymentDate,
      memo: `報支單核銷結案：${voucher.summary || voucher.voucher_no}`
      ,    }]);
    if (jeError) throw jeError;

    const { error: updateError } = await supabase
      .from('vouchers')
      .update({ status: 'closed', payment_date: paymentDate, closed_at: new Date().toISOString() })
      .eq('id', voucherId)
      ;
    if (updateError) throw updateError;

    // 寫入付款紀錄
    await supabase.from('voucher_payments').insert({
      voucher_id: voucherId,
      payment_type: 'bank_transfer',
      bank_account_id: bankAccountId,
      amount: voucher.total_amount,
      paid_at: paymentDate
    });

    if (voucher.applicant_id) {
      await createNotification(
        voucher.applicant_id,
        '您的報支單已完成付款銷案',
        `${voucher.summary || voucher.voucher_no || ''} － 金額 $${Number(voucher.total_amount).toLocaleString()}`,
        voucherId
      );
    }

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