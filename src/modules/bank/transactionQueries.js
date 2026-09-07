const PAGE_SIZE = 250;
const MAX_ROWS = 100000;

async function fetchPages(buildQuery) {
  const rows = [];
  const seen = new Set();
  let expectedCount;
  while (true) {
    const { data, error, count } = await buildQuery().range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('交易查詢缺少完整筆數，請重新載入');
    }
    if (expectedCount !== undefined && count !== expectedCount) {
      throw new Error('交易資料已變動，請重新載入');
    }
    expectedCount = count;
    if (count > MAX_ROWS) throw new Error('交易資料超過清單可載入上限');
    for (const row of data) {
      if (!row.id || seen.has(row.id)) throw new Error('交易分頁資料重複，請重新載入');
      seen.add(row.id);
      rows.push(row);
    }
    if (rows.length === count) return rows;
    if (!data.length || rows.length > count) throw new Error('交易分頁資料不完整，請重新載入');
  }
}

export function fetchTransactionRows(client) {
  return fetchPages(() => client.from('bank_transactions')
    .select('id, bank_account_id, tx_date, type, amount, currency, exchange_rate, amount_base, description, transaction_no, counterparty, category, remark, attachment_id, voucher_id, bank:bank_accounts(bank_name, nickname, account_number), voucher:vouchers(voucher_no, status, category, project_id, summary)', { count: 'exact' })
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }));
}

export async function fetchTransactionJournals(client, transactionIds) {
  const ids = [...new Set(transactionIds.filter(Boolean))];
  const rows = [];
  // Bound the UUID filter independently of pagination to keep REST URLs short.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    rows.push(...await fetchPages(() => client.from('journal_entries')
      .select('id, transaction_id, debit_account_id, credit_account_id, debit_amount, credit_amount, currency, debit_account:accounts!journal_entries_debit_account_id_fkey(code, name), credit_account:accounts!journal_entries_credit_account_id_fkey(code, name)', { count: 'exact' })
      .in('transaction_id', batch)
      .order('id', { ascending: true })));
  }
  return rows;
}

export function summarizeTransactionJournals(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const accounts = grouped.get(entry.transaction_id) || { debit: new Set(), credit: new Set() };
    for (const side of ['debit', 'credit']) {
      const account = entry[`${side}_account`];
      accounts[side].add(account ? `${account.code} ${account.name}` : '-');
    }
    grouped.set(entry.transaction_id, accounts);
  }
  return new Map([...grouped].map(([id, accounts]) => [id, {
    debit: [...accounts.debit].join(' / '),
    credit: [...accounts.credit].join(' / ')
  }]));
}
