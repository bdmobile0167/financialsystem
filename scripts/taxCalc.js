/**
 * 稅額計算工具
 * 依台灣現行制度簡化：
 * - 發票（統一發票）：金額視為「含稅總額」，反推 5% 營業稅額
 * - 收據 / 無：不拆稅額，稅額 = 0
 */
export function calcInvoiceTax(invoiceType, totalAmount) {
  const amount = Number(totalAmount) || 0;

  if (invoiceType === '發票') {
    const netAmount = Math.round(amount / 1.05);
    const taxAmount = amount - netAmount;
    return { netAmount, taxAmount, totalAmount: amount, taxRatePercent: 5 };
  }

  // 收據 / 無：視為免稅或不拆分稅額
  return { netAmount: amount, taxAmount: 0, totalAmount: amount, taxRatePercent: 0 };
}
