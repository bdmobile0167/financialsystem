const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('無法讀取檔案'));
    reader.readAsDataURL(file);
  });
}

export async function scanInvoiceBatch({ files, scan, addRow, progress, apply = applyInvoiceFields }) {
  const results = [];
  // One request per file avoids oversized batch payloads and preserves partial results.
  for (const [index, file] of Array.from(files).entries()) {
    progress?.(index + 1, files.length, file.name);
    try {
      const row = addRow(file);
      if (!row) throw new Error('無法建立明細列');
      const category = row.querySelector('.grid-item-category');
      if (category) {
        category.value = '其他';
        window.toggleCategoryNote?.(category);
      }
      if (!TYPES.has(file.type)) throw new Error('辨識僅支援 JPG、PNG、WebP 或 PDF');
      if (file.size > MAX_BYTES) throw new Error('辨識檔案上限為 3 MB');
      const result = await scan({ imageBase64: await readBase64(file), mimeType: file.type });
      if (!result.ok || !result.extracted) throw new Error(result.message || '辨識失敗');
      apply(row, result.extracted);
      results.push({ name: file.name, ok: true });
    } catch (error) {
      results.push({ name: file.name, ok: false, message: error.message });
    }
  }
  return results;
}

export function applyInvoiceFields(row, extracted) {
  const set = (selector, value) => {
    const input = row.querySelector(selector);
    if (input && value !== null && value !== undefined) input.value = value;
  };
  if (['發票', '收據', '領據'].includes(extracted.docType)) {
    set('.grid-inv-type', extracted.docType);
    window.toggleInvoiceRequired?.(row.querySelector('.grid-inv-type'));
  }
  set('.grid-inv-num', extracted.invoiceNumber);
  if (typeof extracted.amount === 'number' && Number.isFinite(extracted.amount) && extracted.amount >= 0) {
    set('.grid-amount', extracted.amount);
  }
  const month = extracted.receiptMonth || extracted.txDate?.slice(0, 7);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) set('.grid-month', month);
  // Expense descriptions/categories are deliberately owned by the employee.
  window.calculateVoucherTotal?.();
}

export async function handleInvoiceBatchUpload(event, client) {
  const input = event.target;
  const files = Array.from(input.files || []);
  if (!files.length || input.disabled) return;
  const status = document.getElementById('aiScanStatus');
  const show = (text) => { if (status) status.textContent = text; };
  if (files.length > 30) {
    show('每批最多 30 個檔案，請分批選取。');
    input.value = '';
    return;
  }
  input.disabled = true;
  const submitButtons = Array.from(input.closest('form')?.querySelectorAll('[type="submit"]') || []);
  const disabledStates = submitButtons.map((button) => button.disabled);
  submitButtons.forEach((button) => { button.disabled = true; });
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error('登入已失效，請重新登入');
    const results = await scanInvoiceBatch({
      files,
      addRow: (file) => window.addExcelRow(file),
      progress: (index, total, name) => show(`辨識 ${index}/${total}：${name}`),
      scan: async (payload) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
          const response = await fetch('/api/scan-receipt', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify(payload)
          });
          if (!response.ok) throw new Error(`辨識服務回應 ${response.status}`);
          return await response.json();
        } finally { clearTimeout(timeout); }
      }
    });
    const failed = results.filter((result) => !result.ok);
    show(`辨識完成 ${results.length - failed.length}/${results.length}，請覆核號碼、月份、金額並填寫項目。` +
      (failed.length ? ` 待手填：${failed.map((result) => `${result.name}（${result.message}）`).join('；')}` : ''));
  } catch (error) { show(error.message); }
  finally {
    input.disabled = false;
    input.value = '';
    submitButtons.forEach((button, index) => { button.disabled = disabledStates[index]; });
  }
}
