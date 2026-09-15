function normalizeDate(value) {
  const text = String(value || '').trim().replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('每筆對帳資料都必須有有效日期。');
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`無效的對帳日期：${text}`);
  }
  return text;
}

function normalizeAmount(value, label, { nullable = false } = {}) {
  if ((value === null || value === undefined || value === '') && nullable) return null;
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label}必須是大於或等於 0 的有限數字。`);
  return amount;
}

export function normalizeBankStatementRows(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('沒有可匯入的對帳資料。');
  if (records.length > 2000) throw new Error('單次最多匯入 2000 筆對帳資料。');

  return records.map((record, index) => {
    const expense = normalizeAmount(record.expense, `第 ${index + 1} 筆支出`);
    const income = normalizeAmount(record.income, `第 ${index + 1} 筆收入`);
    if (Number(expense > 0) + Number(income > 0) !== 1) {
      throw new Error(`第 ${index + 1} 筆必須只有支出或收入其中一項大於 0。`);
    }
    const detail = String(record.detail || '').trim();
    const counterparty = String(record.counterparty || '').trim();
    if (detail.length > 500 || counterparty.length > 300) throw new Error(`第 ${index + 1} 筆摘要或對象過長。`);
    return {
      tx_date: normalizeDate(record.date ?? record.tx_date),
      detail: detail || null,
      counterparty: counterparty || null,
      expense,
      income,
      balance: normalizeAmount(record.balance, `第 ${index + 1} 筆餘額`, { nullable: true })
    };
  });
}

export async function importBankStatementRows(client, { bankAccountId, bankCode, sourceFileName, records }) {
  if (!client?.rpc) throw new Error('資料庫連線不可用。');
  if (!bankAccountId) throw new Error('請先選擇對應的銀行帳戶。');
  if (!String(bankCode || '').trim()) throw new Error('找不到銀行對帳單解析代碼。');
  if (!String(sourceFileName || '').trim()) throw new Error('找不到來源檔名。');
  const rows = normalizeBankStatementRows(records);
  const { data, error } = await client.rpc('import_bank_statement_rows', {
    p_bank_account_id: bankAccountId,
    p_bank_code: String(bankCode).trim(),
    p_source_file_name: String(sourceFileName).trim(),
    p_rows: rows
  });
  if (error) throw error;
  return data || { success: true, row_count: rows.length, imported_count: rows.length, duplicate_count: 0 };
}
