import supabase from '../../../scripts/supabaseClient.js';
import calcInvoiceTax from '../../../scripts/taxCalc.js';
import showMessage from '../utils/uiHelpers.js';

let excelRowCounter = 0;

export const toggleInvoiceRequired = (selectEl) => {
  const input = selectEl.closest('tr').querySelector('.grid-inv-num');
  if (selectEl.value === '發票') {
    input.disabled = false;
    input.required = true;
    input.placeholder = '必填發票號碼';
  } else {
    input.disabled = true;
    input.required = false;
    input.value = '';
    input.placeholder = '可留空';
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
        <option value="無">無</option>
        <option value="發票">發票</option>
        <option value="收據">收據</option>
        <option value="領據">領據</option>
      </select>
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" placeholder="可留空" style="width:90%; padding:4px;" disabled></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-item-category" onchange="toggleCategoryNote(this)" style="width:100%; padding:4px;">
        <option value="車馬費">車馬費</option>
        <option value="住宿費">住宿費</option>
        <option value="文具用品">文具用品</option>
        <option value="餐飲交際">餐飲交際</option>
        <option value="郵電通訊">郵電通訊</option>
        <option value="設備與軟體授權">設備與軟體授權</option>
        <option value="專業服務費">專業服務費</option>
        <option value="其他">其他（請說明）</option>
      </select>
      <input type="text" class="grid-category-note" placeholder="請說明項目內容" style="display:none; width:96%; padding:4px; margin-top:4px;">
      ${isAccounting ? `
        <select class="line-account-code" style="width:100%; padding:4px; margin-top:4px;">
          <option value="">（會計歸類科目）</option>
        </select>
      ` : ''}
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="number" class="grid-amount" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateVoucherTotal()"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <input type="text" class="grid-payee-id" placeholder="應付對象身分證/統編" style="width:90%; padding:4px;" onblur="fetchPayeeName(this)">
      <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;"></span>
      <label style="font-size:11px; display:block; margin-top:4px;">
        <input type="checkbox" class="grid-proxy-check" onchange="toggleProxyPayer(this)"> 已由他人代付
      </label>
      <input type="text" class="grid-proxy-id" placeholder="代付人身分證/統編" style="display:none; width:90%; padding:4px; margin-top:4px;" onblur="fetchProxyPayerName(this)">
      <span class="grid-proxy-name" style="font-size:12px; color:#666; display:block;"></span>
    </td>
    <td style="padding:8px; border:1px solid #ddd; text-align:center;">
      <input type="file" class="grid-attachment" accept="image/*,.pdf" style="display:none;" onchange="assignLineAttachment('${rowId}', this.files[0])">
      <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="this.previousElementSibling.click()">📎 附件</button>
      <div class="attachment-label" style="font-size:10px; color:#666; margin-top:2px;">未選擇</div>
      <button type="button" class="danger" style="padding:4px 8px; font-size:12px; margin-top:4px;" onclick="this.closest('tr').remove(); calculateVoucherTotal();">刪除</button>
    </td>
  `;
  tbody.appendChild(tr);

  const accountSelect = tr.querySelector('.line-account-code');
  if (accountSelect && window.__cachedAccounts) {
    accountSelect.innerHTML = '<option value="">（會計歸類科目）</option>' +
      window.__cachedAccounts.map(a => `<option value="${a.code}">${a.code} ${a.name}</option>`).join('');
  }

  if (prefillFile) window.assignLineAttachment(rowId, prefillFile);
  return tr;
};
window.addExcelRow = addExcelRow;

export const toggleCategoryNote = (selectEl) => {
  const note = selectEl.closest('td').querySelector('.grid-category-note');
  note.style.display = selectEl.value === '其他' ? 'block' : 'none';
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
