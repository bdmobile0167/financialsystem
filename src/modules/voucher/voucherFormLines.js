// The active voucher line editor currently lives in scripts/ui.js.
// This guard prevents the deprecated module from registering stale window.*
// handlers or reintroducing corrupted form markup.

function deprecatedVoucherFormLines() {
  throw new Error('voucherFormLines.js is deprecated. Use the active voucher line flow in scripts/ui.js.');
}

export const toggleInvoiceRequired = deprecatedVoucherFormLines;
export const calculateVoucherTotal = deprecatedVoucherFormLines;
export const addExcelRow = deprecatedVoucherFormLines;
export const toggleCategoryNote = deprecatedVoucherFormLines;
export const toggleProxyPayer = deprecatedVoucherFormLines;

export default {
  toggleInvoiceRequired,
  calculateVoucherTotal,
  addExcelRow,
  toggleCategoryNote,
  toggleProxyPayer
};
