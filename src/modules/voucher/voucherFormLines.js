import supabase from '../../../scripts/supabaseClient.js';
import calcInvoiceTax from '../../../scripts/taxCalc.js';
import showMessage from '../utils/uiHelpers.js';

let excelRowCounter = 0;

export const toggleInvoiceRequired = (selectEl) => {
  const input = selectEl.closest('tr').querySelector('.grid-inv-num');
  if (selectEl.value === '?潛巨') {
    input.disabled = false;
    input.required = true;
    input.placeholder = '敹‵?潛巨?Ⅳ';
  } else {
    input.disabled = true;
    input.required = false;
    input.value = '';
    input.placeholder = '?舐?蝛?;
  }
};
window.toggleInvoiceRequired = toggleInvoiceRequired;

export const calculateVoucherTotal = () => {
  const amounts = Array.from(document.querySelectorAll('.grid-amount')).map(el => Number(el.value) || 0);
  const total = amounts.reduce((a, b) => a + b, 0);
  const display = document.getElementById('voucherTotalDisplay');
  if (display) display.innerText = `$${total.toLocaleString()}`;
};
window.calculateVoucherTotal = calculateVoucherTotal;

export const addExcelRow = (prefillFile = null) => {
  const tbody = document.getElementById('excelLinesBody');
  if (!tbody) return;
  const isAccounting = ['accounting', 'admin', 'super_admin'].includes(window.state.currentUser?.role);

  const rowId = `row-${excelRowCounter++}`;
  const tr = document.createElement('tr');
  tr.dataset.rowId = rowId;
  tr.innerHTML = `
    <td style="padding:8px; border:1px solid #ddd;"><input type="month" class="grid-month" style="width:96%; padding:4px;"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-inv-type" onchange="toggleInvoiceRequired(this)" style="width:100%; padding:4px;">
        <option value="??>??/option>
        <option value="?潛巨">?潛巨</option>
        <option value="?嗆?">?嗆?</option>
        <option value="??">??</option>
      </select>
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" placeholder="?舐?蝛? style="width:90%; padding:4px;" disabled></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-item-category" onchange="toggleCategoryNote(this)" style="width:100%; padding:4px;">
        <option value="頠收鞎?>頠收鞎?/option>
        <option value="雿挪鞎?>雿挪鞎?/option>
        <option value="??典?">??典?</option>
        <option value="擗ㄡ鈭日?">擗ㄡ鈭日?</option>
        <option value="?菟??">?菟??</option>
        <option value="閮剖???擃?甈?>閮剖???擃?甈?/option>
        <option value="撠平??鞎?>撠平??鞎?/option>
        <option value="?嗡?">?嗡?嚗?隤芣?嚗?/option>
      </select>
      <input type="text" class="grid-category-note" placeholder="隢牧???桀摰? style="display:none; width:96%; padding:4px; margin-top:4px;">
      ${isAccounting ? `
        <select class="line-account-code" style="width:100%; padding:4px; margin-top:4px;">
          <option value="">嚗?閮飛憿??殷?</option>
        </select>
      ` : ''}
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="number" class="grid-amount" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateVoucherTotal()"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <input type="text" class="grid-payee-id" placeholder="??撠情頨怠?霅?蝯梁楊" style="width:90%; padding:4px;" onblur="fetchPayeeName(this)">
      <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;"></span>
      <label for="${rowId}-proxy-check" style="font-size:11px; display:block; margin-top:4px;">
        <input id="${rowId}-proxy-check" type="checkbox" class="grid-proxy-check" onchange="toggleProxyPayer(this)"> 已由他人代付
      </label>
      <input type="text" class="grid-proxy-id" placeholder="隞??鈭箄澈??/蝯梁楊" style="display:none; width:90%; padding:4px; margin-top:4px;" onblur="fetchProxyPayerName(this)">
      <span class="grid-proxy-name" style="font-size:12px; color:#666; display:block;"></span>
    </td>
    <td style="padding:8px; border:1px solid #ddd; text-align:center;">
      <input type="file" class="grid-attachment" accept="image/*,.pdf" style="display:none;" onchange="assignLineAttachment('${rowId}', this.files[0])">
      <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="this.previousElementSibling.click()">?? ?辣</button>
      <div class="attachment-label" style="font-size:10px; color:#666; margin-top:2px;">?芷??/div>
      <button type="button" class="danger" style="padding:4px 8px; font-size:12px; margin-top:4px;" onclick="this.closest('tr').remove(); calculateVoucherTotal();">?芷</button>
    </td>
  `;
  tbody.appendChild(tr);

  const accountSelect = tr.querySelector('.line-account-code');
  if (accountSelect && window.__cachedAccounts) {
    accountSelect.innerHTML = '<option value="">嚗?閮飛憿??殷?</option>' +
      window.__cachedAccounts.map(a => `<option value="${a.code}">${a.code} ${a.name}</option>`).join('');
  }

  if (prefillFile) window.assignLineAttachment(rowId, prefillFile);
  return tr;
};
window.addExcelRow = addExcelRow;

export const toggleCategoryNote = (selectEl) => {
  const note = selectEl.closest('td').querySelector('.grid-category-note');
  note.style.display = selectEl.value === '?嗡?' ? 'block' : 'none';
};
window.toggleCategoryNote = toggleCategoryNote;

export const toggleProxyPayer = (checkboxEl) => {
  const cell = checkboxEl.closest('td');
  const proxyInput = cell.querySelector('.grid-proxy-id');
  const proxyName = cell.querySelector('.grid-proxy-name');
  proxyInput.style.display = checkboxEl.checked ? 'block' : 'none';
  if (!checkboxEl.checked) { proxyInput.value = ''; proxyName.innerText = ''; }
};
window.toggleProxyPayer = toggleProxyPayer;
