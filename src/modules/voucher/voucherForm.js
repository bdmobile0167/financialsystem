// The active voucher form currently lives in scripts/ui.js.
// This module is kept as a guard so old imports fail with a clear message
// instead of registering stale window.* handlers over the production flow.

export function renderVoucherForm() {
  throw new Error('voucherForm.js is deprecated. Use the active voucher flow in scripts/ui.js.');
}

export default renderVoucherForm;
