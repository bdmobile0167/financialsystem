import { supabase } from '../../../scripts/supabaseClient.js';

/**
 * IFRS 調整分錄 API
 * 平行帳簿架構：journal_entries（Local GAAP 原始總帳）之外的獨立調整分錄層。
 * 只有 status = 'approved' 的分錄，才會被計入「IFRS 調整後」的試算表／財報。
 */

export async function fetchIfrsAdjustments() {
  const { data, error } = await supabase
    .from('ifrs_adjustments')
    .select('*, ifrs_adjustment_lines(*, account:accounts(code, name))')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * 建立一筆調整分錄草稿（含明細）。
 * lines: [{ account_id, debit_amount, credit_amount, memo }]
 */
export async function createIfrsAdjustment({ standard, reason, entryDate, lines }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('請至少填寫一行借方與一行貸方分錄');
  }
  const { data, error } = await supabase.rpc('create_ifrs_adjustment_atomic', {
    p_standard: standard,
    p_reason: reason,
    p_entry_date: entryDate || new Date().toISOString().slice(0, 10),
    p_lines: lines.map(line => ({
      account_id: line.account_id,
      debit_amount: Number(line.debit_amount || 0),
      credit_amount: Number(line.credit_amount || 0),
      memo: line.memo || null
    }))
  });
  if (error) throw error;
  return data;
}

/**
 * 核准調整分錄：資料庫 trigger 會自動驗證借貸平衡，不平衡會直接拋出錯誤。
 * 用條件式更新（.eq('status','draft')）防止重複核准。
 */
export async function approveIfrsAdjustment(adjustmentId) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase
    .from('ifrs_adjustments')
    .update({ status: 'approved', approved_by: userId })
    .eq('id', adjustmentId)
    .eq('status', 'draft')
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('此調整分錄已被核准或狀態已變更，請重新整理後再確認。');
  }
  return data[0];
}

/**
 * 沖銷已核准的調整分錄。已核准的分錄不能直接修改／刪除，只能標記為 reversed，
 * 需要更正時另外開立一筆新的調整分錄。
 */
export async function reverseIfrsAdjustment(adjustmentId, reason) {
  if (!reason || !reason.trim()) {
    throw new Error('請填寫沖銷原因');
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase
    .from('ifrs_adjustments')
    .update({
      status: 'reversed',
      reversed_by: userId,
      reversed_at: new Date().toISOString(),
      reversal_reason: reason.trim()
    })
    .eq('id', adjustmentId)
    .eq('status', 'approved')
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('此調整分錄非「已核准」狀態，無法沖銷，請重新整理後再確認。');
  }
  return data[0];
}

/**
 * 原子刪除草稿及明細；資料庫會驗證角色、狀態並寫入稽核紀錄。
 */
export async function deleteIfrsAdjustmentDraft(adjustmentId) {
  const { data, error } = await supabase.rpc('delete_ifrs_adjustment_draft', {
    p_adjustment_id: adjustmentId
  });
  if (error) throw error;
  if (!data?.deleted || data.id !== adjustmentId) {
    throw new Error('草稿未刪除，請重新整理後再試。');
  }
  return data;
}

/**
 * 取得「已核准」調整分錄的科目借貸加總，供試算表／財報合併 Local GAAP 使用。
 * 回傳格式：{ [account_id]: { debitTotal, creditTotal } }
 */
export async function fetchApprovedAdjustmentTotals(startDate = null, endDate = null) {
  let query = supabase
    .from('ifrs_adjustment_lines')
    .select('account_id, debit_amount, credit_amount, ifrs_adjustments!inner(status, entry_date)')
    .eq('ifrs_adjustments.status', 'approved');
  if (startDate) query = query.gte('ifrs_adjustments.entry_date', startDate);
  if (endDate) query = query.lte('ifrs_adjustments.entry_date', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const totals = {};
  (data || []).forEach(line => {
    if (!totals[line.account_id]) totals[line.account_id] = { debitTotal: 0, creditTotal: 0 };
    totals[line.account_id].debitTotal += Number(line.debit_amount || 0);
    totals[line.account_id].creditTotal += Number(line.credit_amount || 0);
  });
  return totals;
}
