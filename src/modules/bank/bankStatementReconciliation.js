const PAGE_SIZE = 50;

export async function fetchBankStatementPage(client, bankAccountId, page = 0) {
  if (!bankAccountId) return { rows: [], count: 0 };
  const start = Math.max(0, Math.trunc(page)) * PAGE_SIZE;
  const { data, count, error } = await client.from('bank_statement_transactions')
    .select('id, bank_account_id, tx_date, detail, counterparty, expense, income, currency, is_reconciled, matched_bank_transaction_id', { count: 'exact' })
    .eq('bank_account_id', bankAccountId)
    .order('tx_date', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function fetchBankStatementCandidates(client, statement) {
  if (!statement?.bank_account_id) throw new Error('請先選擇銀行對帳資料。');
  const income = Number(statement.income || 0);
  const amount = income > 0 ? income : Number(statement.expense || 0);
  const type = income > 0 ? '收入' : '支出';
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('帳單金額無效。');
  const { data, error } = await client.from('bank_transactions')
    .select('id, tx_date, type, amount, currency, description, transaction_no')
    .eq('bank_account_id', statement.bank_account_id)
    .eq('currency', statement.currency)
    .eq('type', type)
    .eq('amount', amount)
    .order('tx_date', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function setBankStatementMatch(client, statementId, bankTransactionId = null) {
  if (!statementId) throw new Error('請選擇銀行對帳資料。');
  const { data, error } = await client.rpc('set_bank_statement_match', {
    p_statement_id: statementId,
    p_bank_transaction_id: bankTransactionId || null
  });
  if (error) throw error;
  return data;
}

export const BANK_STATEMENT_PAGE_SIZE = PAGE_SIZE;
