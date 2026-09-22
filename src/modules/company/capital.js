const CAPITAL_SOURCE_KEYS = [
  'capitalCash',
  'capitalProperty',
  'capitalTechnology',
  'capitalMergeNew'
];

export function parseCapitalAmount(value, label = '金額') {
  const normalized = value === '' || value == null ? 0 : Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label}必須是 0 以上的有效金額`);
  }
  return Math.round((normalized + Number.EPSILON) * 100) / 100;
}

export function getPaidInCapital(companyInfo = {}) {
  return CAPITAL_SOURCE_KEYS.reduce(
    (total, key) => total + parseCapitalAmount(companyInfo[key]),
    0
  );
}

export function applyPaidInCapitalTotal(companyInfo = {}, paidInCapital = 0) {
  const targetTotal = parseCapitalAmount(paidInCapital, '實收資本額');
  const capitalProperty = parseCapitalAmount(companyInfo.capitalProperty, '財產出資');
  const capitalTechnology = parseCapitalAmount(companyInfo.capitalTechnology, '技術出資');
  const capitalMergeNew = parseCapitalAmount(companyInfo.capitalMergeNew, '合併新設出資');
  const nonCashTotal = capitalProperty + capitalTechnology + capitalMergeNew;

  if (targetTotal < nonCashTotal) {
    throw new Error(`實收資本額不可低於非現金出資合計 ${nonCashTotal.toLocaleString()}`);
  }

  return {
    ...companyInfo,
    capitalCash: Math.round((targetTotal - nonCashTotal + Number.EPSILON) * 100) / 100,
    capitalProperty,
    capitalTechnology,
    capitalMergeNew
  };
}

export function useCashOnlyCapital(companyInfo = {}, paidInCapital = 0) {
  const targetTotal = parseCapitalAmount(paidInCapital, '實收資本額');
  return {
    ...companyInfo,
    capitalCash: targetTotal,
    capitalProperty: 0,
    capitalTechnology: 0,
    capitalMergeNew: 0
  };
}

export function getShareholderContributionTotal(shareholders = []) {
  return (shareholders || []).reduce(
    (total, person) => total + parseCapitalAmount(person?.amount, '股東出資'),
    0
  );
}

export function getCapitalComparison(companyInfo = {}, shareholders = []) {
  const totalCapital = parseCapitalAmount(companyInfo.totalCapital, '資本總額');
  const paidInCapital = getPaidInCapital(companyInfo);
  const shareholderTotal = getShareholderContributionTotal(shareholders);
  return {
    totalCapital,
    paidInCapital,
    shareholderTotal,
    paidInExceedsTotal: paidInCapital > totalCapital,
    shareholderDifference: Math.round((shareholderTotal - paidInCapital) * 100) / 100
  };
}
