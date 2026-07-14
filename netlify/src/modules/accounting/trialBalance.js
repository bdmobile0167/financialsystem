export function buildTrialBalance(generalLedger) {
  const rows = Object.values(generalLedger)
    .filter(item => item.debitTotal > 0 || item.creditTotal > 0)
    .map(item => ({
      code: item.account.code,
      name: item.account.name,
      type: item.account.type,
      debitTotal: item.debitTotal,
      creditTotal: item.creditTotal
    }));

  const totalDebit = rows.reduce((sum, r) => sum + r.debitTotal, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.creditTotal, 0);

  return {
    rows,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01
  };
}