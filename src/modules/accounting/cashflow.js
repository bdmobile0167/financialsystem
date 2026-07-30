export function buildCashFlowByActivity(transactions) {
  const totals = { 營業: 0, 投資: 0, 融資: 0 };

  transactions.forEach(tx => {
    const category = tx.category || '營業';
    const amount = Number(tx.amount || 0);
    const signedAmount = tx.type === '收入' ? amount : -amount;
    totals[category] = (totals[category] || 0) + signedAmount;
  });

  const net = totals['營業'] + totals['投資'] + totals['融資'];
  return { operating: totals['營業'], investing: totals['投資'], financing: totals['融資'], net };
}