function getMonthKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildVoucherSummary(transactions) {
  const byMonth = {};

  transactions.forEach(tx => {
    const monthKey = getMonthKey(tx.date);
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = {
        month: monthKey, totalCount: 0, matchedCount: 0, unmatchedCount: 0,
        totalIncome: 0, totalExpense: 0, byCounterparty: {}, byBank: {}
      };
    }
    const bucket = byMonth[monthKey];
    const amount = Number(tx.amount || 0);
    const counterparty = tx.customer || tx.detail || '未指定對象';
    const bank = tx.bank || '未指定銀行';

    bucket.totalCount += 1;
    tx.voucher ? bucket.matchedCount++ : bucket.unmatchedCount++;
    if (tx.type === '收入') bucket.totalIncome += amount;
    if (tx.type === '支出') bucket.totalExpense += amount;

    bucket.byCounterparty[counterparty] ??= { received: 0, paid: 0 };
    if (tx.type === '收入') bucket.byCounterparty[counterparty].received += amount;
    if (tx.type === '支出') bucket.byCounterparty[counterparty].paid += amount;

    bucket.byBank[bank] ??= { received: 0, paid: 0 };
    if (tx.type === '收入') bucket.byBank[bank].received += amount;
    if (tx.type === '支出') bucket.byBank[bank].paid += amount;
  });

  return Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));
}

export function getCurrentMonthVoucherSummary(transactions) {
  const list = buildVoucherSummary(transactions);
  const key = getMonthKey(new Date().toISOString());
  return list.find(item => item.month === key) || {
    month: key, totalCount: 0, matchedCount: 0, unmatchedCount: 0,
    totalIncome: 0, totalExpense: 0, byCounterparty: {}, byBank: {}
  };
}