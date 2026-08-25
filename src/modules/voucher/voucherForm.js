import { supabase } from '../../../scripts/supabaseClient.js';
import { fetchAccounts, fetchBankAccounts, fetchDepartments, fetchProjects } from './voucherApi.js';
import { resolveVoucherNumber } from './voucherNumbering.js';
import { calcInvoiceTax } from '../../../scripts/taxCalc.js';
import { saveAttachment, deleteAttachment } from './attachments.js';
import { getStatusBadge, buildApprovalStepperHtml, maskPersonName, maskIdentifierString, maskPayeeName, showMessage, populateBankSelect } from '../utils/uiHelpers.js';

let excelRowCounter = 0;
const voucherLineAttachments = {}; // { rowId: File }

function isFinanceOperator() {
  return ['admin', 'super_admin', 'accounting'].includes(window.state?.currentUser?.role);
}

/**
 * 切換發票號碼欄位的啟用/禁用狀態
 */
window.toggleInvoiceRequired = (selectEl) => {
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

/**
 * 計算報支單總金額
 */
window.calculateVoucherTotal = () => {
  const amounts = Array.from(document.querySelectorAll('.grid-amount')).map(el => Number(el.value) || 0);
  const total = amounts.reduce((a, b) => a + b, 0);
  const display = document.getElementById('voucherTotalDisplay');
  if (display) display.innerText = `$${total.toLocaleString()}`;
};

/**
 * 查詢付款人名稱
 */
window.fetchPayeeName = async (inputEl) => {
  const identifier = inputEl.value.trim();
  const container = inputEl.closest('td, div');
  const nameSpan = container.querySelector('.grid-payee-name');
  if (!nameSpan) return;
  if (!identifier) { nameSpan.innerHTML = ''; return; }
  if (!isFinanceOperator()) {
    nameSpan.innerHTML = '';
    delete nameSpan.dataset.fullName;
    return;
  }

  nameSpan.innerText = '查詢中...';
  const { data, error } = await supabase.from('payees').select('name').eq('identifier', identifier).maybeSingle();

  if (error || !data) {
    nameSpan.innerHTML = `查無資料 <button type="button" class="secondary" style="padding:2px 6px; font-size:11px;" onclick="openAddPayeeModal('${identifier}', this)">＋ 新增付款人</button>`;
    return;
  }
  nameSpan.innerText = maskPayeeName(data.name);
  nameSpan.dataset.fullName = data.name;
};

/**
 * 開啟新增付款人 Modal
 */
window.openAddPayeeModal = (prefillIdentifier, triggerBtn) => {
  if (!isFinanceOperator()) {
    showMessage('請直接填寫付款人姓名與身分證/統編；付款人主檔由會計人員維護。', true);
    return;
  }
  const container = document.getElementById('addPayeeModalContainer');
  container.innerHTML = `
    <div class="modal-backdrop" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;">
      <div style="background:#fff; padding:24px; border-radius:8px; max-width:420px; width:90%;">
        <h3 style="margin-top:0;">新增付款人</h3>
        
        <label>身分證／統一編號</label>
        <input type="text" id="newPayeeIdentifier" value="${prefillIdentifier || ''}" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <label>姓名／公司名稱</label>
        <input type="text" id="newPayeeName" style="width:100%; padding:6px; margin-bottom:10px;" required>
        
        <label>類型</label>
        <select id="newPayeeType" style="width:100%; padding:6px; margin-bottom:10px;">
          <option value="individual">個人</option>
          <option value="company">公司／廠商</option>
        </select>
        
        <label>Email</label>
        <input type="email" id="newPayeeEmail" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <label>電話</label>
        <input type="text" id="newPayeePhone" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <label>地址</label>
        <input type="text" id="newPayeeAddress" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <!-- 匯款資訊區塊 -->
        <div style="background:#f9fafb; padding:12px; border-radius:6px; margin-bottom:14px; border:1px solid #e5e7eb;">
          <label style="font-weight:600; color:#374151;">金融機構代號（選填，共7碼）</label>
          <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">前3碼總行代號 + 後4碼分支代號（例如中國信託營業部：8220016）</div>
          <input type="text" id="newPayeeBankCode" placeholder="請輸入7碼數字" maxlength="7" oninput="this.value=this.value.replace(/[^0-9]/g,'')" style="width:100%; padding:6px; margin-bottom:10px;">
          
          <label style="font-weight:600; color:#374151;">銀行帳號（選填）</label>
          <input type="text" id="newPayeeBankAccount" placeholder="請輸入銀行帳號" oninput="this.value=this.value.replace(/[^0-9-]/g,'')" style="width:100%; padding:6px;">
        </div>
        
        <div style="text-align:right;">
          <button type="button" class="secondary" onclick="document.querySelector('.modal-backdrop').remove()">取消</button>
          <button type="button" class="primary-btn" onclick="submitNewPayee('${triggerBtn ? triggerBtn.closest('td, div').querySelector('.grid-payee-id')?.id || '' : ''}')">儲存</button>
        </div>
      </div>
    </div>`;
  window.__payeeTriggerContext = triggerBtn;
};

/**
 * 提交新增付款人
 */
window.submitNewPayee = async () => {
  const identifier = document.getElementById('newPayeeIdentifier').value.trim();
  const name = document.getElementById('newPayeeName').value.trim();
  
  if (!identifier || !name) { 
    alert('身分證/統編與姓名為必填'); 
    return; 
  }

  const bankCode = document.getElementById('newPayeeBankCode').value.trim();
  const bankAcc = document.getElementById('newPayeeBankAccount').value.trim();
  
  if (bankCode && bankCode.length !== 7) {
    alert('金融機構代號必須為完整的7碼數字（3碼總行+4碼分支）。');
    return;
  }

  let finalBankAccount = null;
  if (bankCode || bankAcc) {
    finalBankAccount = `${bankCode ? bankCode : ''}${bankCode && bankAcc ? '-' : ''}${bankAcc ? bankAcc : ''}`;
  }

  const payload = {
    identifier,
    name,
    type: document.getElementById('newPayeeType').value,
    email: document.getElementById('newPayeeEmail').value.trim() || null,
    phone: document.getElementById('newPayeePhone').value.trim() || null,
    address: document.getElementById('newPayeeAddress').value.trim() || null,
    bank_account: finalBankAccount
  };

  try {
    const { error } = await supabase.from('payees').insert({ ...payload });
    if (error) throw error;
    
    showMessage('付款人已新增。');
    document.querySelector('.modal-backdrop')?.remove();
    
    const trigger = window.__payeeTriggerContext;
    if (trigger) {
      const container = trigger.closest('td, div');
      const idInput = container.querySelector('.grid-payee-id, .grid-proxy-id');
      const nameSpan = container.querySelector('.grid-payee-name, .grid-proxy-name');
      
      if (idInput) idInput.value = identifier;
      if (nameSpan) { 
        nameSpan.innerText = maskPayeeName(name); 
        nameSpan.dataset.fullName = name; 
      }
    }
  } catch (error) {
    alert('新增失敗：' + error.message);
  }
};

/**
 * 切換類別備註顯示
 */
window.toggleCategoryNote = (selectEl) => {
  const note = selectEl.closest('td').querySelector('.grid-category-note');
  note.style.display = selectEl.value === '其他' ? 'block' : 'none';
};

/**
 * 切換代付人欄位
 */
window.toggleProxyPayer = (checkboxEl) => {
  const cell = checkboxEl.closest('td');
  const proxyInput = cell.querySelector('.grid-proxy-id');
  const proxyName = cell.querySelector('.grid-proxy-name');
  proxyInput.style.display = checkboxEl.checked ? 'block' : 'none';
  if (!checkboxEl.checked) { proxyInput.value = ''; proxyName.innerText = ''; }
};

/**
 * 查詢代付人名稱
 */
window.fetchProxyPayerName = async (inputEl) => {
  const identifier = inputEl.value.trim();
  const nameSpan = inputEl.closest('td').querySelector('.grid-proxy-name');
  if (!identifier) { nameSpan.innerHTML = ''; return; }
  if (!isFinanceOperator()) {
    nameSpan.innerHTML = '';
    delete nameSpan.dataset.fullName;
    return;
  }
  nameSpan.innerText = '查詢中...';
  const { data } = await supabase.from('payees').select('name').eq('identifier', identifier).maybeSingle();
  if (data) {
    nameSpan.innerText = `代付人：${maskPayeeName(data.name)}`;
    nameSpan.dataset.fullName = data.name;
  } else {
    nameSpan.innerHTML = `查無代付人資料 <button type="button" class="secondary" style="padding:2px 6px; font-size:11px;" onclick="openAddPayeeModal('${identifier}', this)">＋ 新增</button>`;
  }
};

/**
 * 指派明細行附件
 */
window.assignLineAttachment = (rowId, file) => {
  if (!file) return;
  voucherLineAttachments[rowId] = file;
  const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
  const label = row?.querySelector('.attachment-label');
  if (label) label.textContent = `已選擇：${file.name}`;
};

/**
 * 新增報支單明細行
 */
window.addExcelRow = (prefillFile = null) => {
  const tbody = document.getElementById('excelLinesBody');
  if (!tbody) return;
  const isAccounting = isFinanceOperator();

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
};

/**
 * 填充報支單表單選項
 */
export async function populateVoucherFormOptions() {
  try {
    const [accounts, banks, departments] = await Promise.all([
      fetchAccounts(), fetchBankAccounts(), fetchDepartments()
    ]);

    window.__cachedAccounts = accounts;

    const role = window.state?.currentUser?.role;
    const acctGroup = document.getElementById('accountingFieldsGroup');
    if (acctGroup) {
        acctGroup.style.display = ['accounting', 'admin'].includes(role) ? 'flex' : 'none';
    }

    const tbody = document.getElementById('excelLinesBody');
    if (tbody && tbody.children.length === 0) {
        for(let i=0; i<5; i++) window.addExcelRow();
    }

    const accountSelect = document.getElementById('vAccountCode');
    if (accountSelect) {
      accountSelect.innerHTML = accounts.map(a => 
        `<option value="${a.code}">${a.code} ${a.name}</option>`
      ).join('');
    }

    const bankSelect = document.getElementById('vBankAccount');
    if (bankSelect) {
      bankSelect.innerHTML = '<option value="">（現金支付免選）</option>' + 
        banks.map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('');
    }
    
    await populateManagerPickerGrouped();
    
    const deptSelect = document.getElementById('vDepartment');
    if (deptSelect) {
      if (window.state?.currentUser?.role === 'employee') {
        deptSelect.innerHTML = `<option value="${window.state.currentUser.department_id || ''}">${window.state.currentUser.department_name || '我的部門'}</option>`;
        deptSelect.disabled = true;
      } else {
        deptSelect.innerHTML = departments.length
          ? departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
          : '<option value="">尚未建立部門</option>';
      }
      await loadDepartmentPeople(deptSelect.value);
    }

    const projectSelect = document.getElementById('vProject');
    if (projectSelect) {
      const projects = await fetchProjects();
      projectSelect.innerHTML = '<option value="">無專案</option>' + 
        projects.map(p => `<option value="${p.id}">${p.project_code} - ${p.name}</option>`).join('');
    }
  } catch (error) {
    console.error(error);
    showMessage(`載入表單選項失敗：${error.message}`, true);
  }
}

/**
 * 群組式主管選擇器
 */
async function populateManagerPickerGrouped() {
  const managerSelect = document.getElementById('vManagerPicker');
  if (!managerSelect) return;

  const { data: managers, error } = await supabase
    .from('profiles')
    .select('id, full_name, department_id, departments(name)')
    .eq('role', 'manager');

  if (error || !managers) {
    managerSelect.innerHTML = '<option value="">不指定</option>';
    return;
  }

  const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
  const grouped = {};
  managers.forEach(m => {
    const deptName = m.departments?.name || '未分配部門';
    if (!grouped[deptName]) grouped[deptName] = [];
    grouped[deptName].push(m);
  });

  let html = '<option value="">不指定（整個部門主管都能審）</option>';
  Object.keys(grouped).sort(strokeSort.compare).forEach(deptName => {
    const people = grouped[deptName].sort((a, b) => strokeSort.compare(a.full_name, b.full_name));
    html += `<optgroup label="${deptName}">`;
    html += people.map(m => `<option value="${m.id}">${m.full_name}</option>`).join('');
    html += `</optgroup>`;
  });

  managerSelect.innerHTML = html;
}

/**
 * 載入部門人員
 */
async function loadDepartmentPeople(deptId) {
  const managerSelect = document.getElementById('vManagerPicker');
  if (!managerSelect) return;

  if (!deptId) {
    managerSelect.innerHTML = '<option value="">請先選擇部門</option>';
    return;
  }

  const { data: people, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('department_id', deptId);

  if (error || !people || people.length === 0) {
    managerSelect.innerHTML = '<option value="">此部門尚無人員資料</option>';
    return;
  }

  const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
  const sorted = [...people].sort((a, b) => strokeSort.compare(a.full_name || '', b.full_name || ''));

  const ROLE_LABEL = { manager: '主管', accounting: '會計', admin: '管理員', employee: '專員' };
  managerSelect.innerHTML = '<option value="">不指定（整個部門主管都能審）</option>' +
    sorted.map(p => `<option value="${p.id}">${p.full_name}${p.role === 'manager' ? '（主管）' : ` (${ROLE_LABEL[p.role] || p.role})`}</option>`).join('');
}

document.getElementById('vDepartment')?.addEventListener('change', (e) => {
  loadDepartmentPeople(e.target.value);
});

/**
 * 報支單表單提交處理
 */
const excelVoucherForm = document.getElementById('voucherCreateForm');
if (excelVoucherForm) {
  excelVoucherForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const txDate = document.getElementById('vDate')?.value || new Date().toISOString().split('T')[0];
      const projectId = document.getElementById('vProject')?.value || null;
      const generalSummary = document.getElementById('vTitle')?.value.trim() || "批量多行核銷單據";
      const departmentId = document.getElementById('vDepartment')?.value || null;
      const managerId = document.getElementById('vManagerPicker')?.value || null;
      const tripStart = document.getElementById('vTripStart')?.value || null;
      const tripEnd = document.getElementById('vTripEnd')?.value || null;
      
      const rows = document.querySelectorAll('#excelLinesBody tr');
      let detailLines = [];
      let invoiceLines = [];
      let calculatedTotal = 0;

      rows.forEach((row) => {
        const descInput = row.querySelector('.grid-category-note');
        const categorySelect = row.querySelector('.grid-item-category');
        const amtInput = row.querySelector('.grid-amount');
        const invTypeInput = row.querySelector('.grid-inv-type');
        const invNumInput = row.querySelector('.grid-inv-num');
        const accountSelect = row.querySelector('.line-account-code');
        const payeeIdInput = row.querySelector('.grid-payee-id');
        const payeeNameSpan = row.querySelector('.grid-payee-name');
        const proxyCheck = row.querySelector('.grid-proxy-check');
        const proxyIdInput = row.querySelector('.grid-proxy-id');
        const proxyNameSpan = row.querySelector('.grid-proxy-name');

        const amt = Number(amtInput?.value || 0);
        const category = categorySelect ? categorySelect.value : '';
        const categoryNote = category === '其他' ? (descInput?.value.trim() || '') : '';
        const description = category === '其他' ? categoryNote : category;

        if (!description || amt <= 0) return;

        calculatedTotal += amt;

        detailLines.push({
          description,
          item_category: category,
          item_category_note: categoryNote,
          account_code: accountSelect ? (accountSelect.value || null) : null,
          amount: amt,
          payee_identifier: payeeIdInput?.value.trim() || null,
          payee_name: payeeNameSpan?.innerText.includes('查無') ? null : (payeeNameSpan?.innerText || null),
          is_proxy_payment: proxyCheck?.checked || false,
          proxy_payer_identifier: proxyCheck?.checked ? (proxyIdInput?.value.trim() || null) : null,
          proxy_payer_name: proxyCheck?.checked ? (proxyNameSpan?.innerText.replace('代付人：', '') || null) : null
        });

        const invType = invTypeInput ? invTypeInput.value : '無';
        if (invType !== '無') {
          const taxInfo = calcInvoiceTax(invType, amt);
          invoiceLines.push({
            invoice_type: invType,
            invoice_number: invNumInput?.value.trim() || null,
            amount: amt,
            tax_amount: taxInfo.taxAmount
          });
        }
      });

      if (detailLines.length === 0) {
        throw new Error('請至少填寫一筆有效的摘要與金額！');
      }

      const attachmentsMap = typeof voucherLineAttachments !== 'undefined' ? voucherLineAttachments : {};

      const voucherPayload = {
        txDate: txDate,
        projectId: projectId && projectId !== 'all' ? projectId : null,
        applicantId: window.state?.currentUser?.id,
        departmentId: departmentId,
        currentManagerId: managerId,
        category: '營業',
        summary: generalSummary,
        totalAmount: calculatedTotal,
        status: 'pending_review',
        detailLines: detailLines,
        invoiceLines: invoiceLines,
        attachmentsMap: attachmentsMap,
        rows: rows,
        tripStartDate: tripStart,
        tripEndDate: tripEnd
      };

      const result = await createVoucher(voucherPayload);

      if (!result || !result.success) {
        throw new Error(result?.error || '建立報支單失敗');
      }

      alert(`✅ 送出成功！總計金額：$${calculatedTotal.toLocaleString()}`);

      excelVoucherForm.reset();

      if (typeof renderVoucherLines === 'function') {
        renderVoucherLines();
      } else {
        const tbody = document.getElementById('excelLinesBody');
        if (tbody) tbody.innerHTML = '';
        for(let i = 0; i < 3; i++) {
          if (typeof window.addExcelRow === 'function') window.addExcelRow();
        }
      }

      renderDashboard();
      if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();

    } catch (err) {
      console.error(err);
      alert('送出報支單失敗：' + err.message);
    }
  });
}

/**
 * 開啟重送 Modal
 */
window.openResubmitModal = async (voucherId) => {
  try {
    const { data: vch, error: vError } = await supabase
      .from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .eq('id', voucherId)
      .single();
    
    if (vError || !vch) throw new Error('無法讀取報支明細資料');

    const { data: lines } = await supabase.from('voucher_lines').select('*').eq('voucher_id', voucherId);
    const { data: invoices } = await supabase.from('invoices').select('*').eq('voucher_id', voucherId);
    const attachments = await getAttachmentsByVoucherId(voucherId);
    
    const { data: logs } = await supabase
      .from('voucher_workflow_logs')
      .select('*, profiles!actor_id(full_name)')
      .eq('voucher_id', voucherId)
      .order('created_at', { ascending: true });

    let modal = document.getElementById('voucherDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voucherDetailModal';
      modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:9999;";
      document.body.appendChild(modal);
    }

    const linesHtml = (lines || []).map(l => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:6px;">${l.description || l.item_category || '-'}</td>
        <td style="padding:6px;">${l.account_code || '-'}</td>
        <td style="padding:6px; text-align:right;">$${Number(l.amount || 0).toLocaleString()}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="muted" style="padding:6px;">無明細項目</td></tr>';

    const invoicesHtml = (invoices || []).map(inv => `
      <div style="font-size:13px; color:#374151; margin-bottom:4px;">
        📄 類型：${inv.invoice_type} ｜ 號碼：${inv.invoice_number || '未填'} ｜ 金額：$${Number(inv.amount || 0).toLocaleString()}
      </div>
    `).join('') || '<div class="muted" style="font-size:13px;">無發票/收據資訊</div>';

    const logsHtml = (logs || []).length
      ? `<ul class="timeline">${logs.map(l => `
          <li class="${l.action?.includes('reject') ? 'rejected' : (l.action === 'close' ? 'closed' : '')}">
            <div class="tl-title">${l.profiles?.full_name || '系統'} 執行：${l.action}${l.to_status ? ` → ${STATUS_LABELS[l.to_status] || l.to_status}` : ''}</div>
            <div class="tl-meta">${new Date(l.created_at).toLocaleString('zh-TW')}</div>
            ${l.reject_reason ? `<div class="tl-note">${l.reject_reason}</div>` : ''}
          </li>
        `).join('')}</ul>`
      : '<p class="muted" style="font-size:13px;">尚無審批紀錄。</p>';

    const firstAccountCode = (lines || []).find(l => l.account_code)?.account_code || null;
    const verification = await runVoucherCrossVerification(voucherId, firstAccountCode);
    const verifyHtml = `
      <div class="verify-panel">
        ${verification.notes.map(n => `
          <div class="verify-item ${n.level}">
            <span class="icon">${n.level === 'error' ? '❌' : (n.level === 'warn' ? '⚠️' : '✓')}</span>
            <span>${n.text.replace(/^[❌⚠️✓]+\s*/, '')}</span>
          </div>
        `).join('')}
      </div>`;

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff; padding:24px; border-radius:8px; width:90%; max-width:700px; max-height:85vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #eee; padding-bottom:10px; margin-bottom:15px;">
          <h3 style="margin:0;">單據詳細內容 [${vch.voucher_no || '未編號'}]</h3>
          <button onclick="document.getElementById('voucherDetailModal').style.display='none'" style="font-size:24px; cursor:pointer; background:none; border:none;">&times;</button>
        </div>
        
        ${buildApprovalStepperHtml(vch.status)}

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:15px; font-size:14px; color:#4b5563;">
          <p style="margin:4px 0;"><strong>申請日期：</strong>${vch.tx_date || vch.created_at?.split('T')[0]}</p>
          <p style="margin:4px 0;"><strong>申請人：</strong>${vch.profiles?.full_name || '未知'}</p>
          <p style="margin:4px 0;"><strong>部門：</strong>${vch.departments?.name || '未分配'}</p>
          <p style="margin:4px 0;"><strong>狀態：</strong>${typeof getStatusBadge === 'function' ? getStatusBadge(vch.status) : (vch.status || '-')}</p>
          <p style="margin:4px 0; grid-column: span 2;"><strong>總摘要：</strong>${vch.summary || '-'}</p>
          <p style="margin:4px 0; grid-column: span 2;"><strong>總金額：</strong><span style="font-size:16px; font-weight:700; color:#059669;">$${Number(vch.total_amount || 0).toLocaleString()}</span></p>
        </div>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">明細項目</h4>
        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:15px;">
          <thead>
            <tr style="background:#f8f9fa; text-align:left;">
              <th style="padding:6px;">說明 / 類別</th>
              <th style="padding:6px;">會計科目</th>
              <th style="padding:6px; text-align:right;">金額</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">憑證 / 發票資訊</h4>
        <div style="margin-bottom:15px;">
          ${invoicesHtml}
        </div>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">憑證與勾稽核對</h4>
        <div style="margin-bottom:15px;">
          ${verifyHtml}
        </div>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">審批歷程</h4>
        <div style="margin-bottom:15px; max-height:220px; overflow-y:auto; padding:8px 4px;">
          ${logsHtml}
        </div>

        <div style="text-align:right; margin-top:20px;">
          <button type="button" class="secondary" onclick="document.getElementById('voucherDetailModal').style.display='none'">關閉</button>
          <button type="button" class="secondary" onclick="openResubmitForm('${voucherId}')">修改並重送</button>
        </div>
      `;
  } catch (err) {
    console.error(err);
    alert('載入單據詳細內容失敗：' + err.message);
  }
};

/**
 * 開啟重送表單
 */
window.openResubmitForm = async (voucherId) => {
  document.getElementById('voucherDetailModal').style.display = 'none';
  
  try {
    const { data: vch, error: vError } = await supabase
      .from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .eq('id', voucherId)
      .single();
    
    if (vError || !vch) throw new Error('無法讀取報支明細資料');

    const { data: lines } = await supabase.from('voucher_lines').select('*').eq('voucher_id', voucherId);
    const { data: invoices } = await supabase.from('invoices').select('*').eq('voucher_id', voucherId);
    const attachments = await getAttachmentsByVoucherId(voucherId);
    
    activateTab('voucherWorkflow');
    await populateVoucherFormOptions();

    document.getElementById('vDate').value = vch.tx_date || '';
    document.getElementById('vTitle').value = vch.summary || '';
    document.getElementById('vDepartment').value = vch.department_id || '';
    document.getElementById('vManagerPicker').value = vch.current_manager_id || '';
    document.getElementById('vProject').value = vch.project_id || '';
    document.getElementById('vTripStart').value = vch.trip_start_date || '';
    document.getElementById('vTripEnd').value = vch.trip_end_date || '';

    const tbody = document.getElementById('excelLinesBody');
    tbody.innerHTML = '';

    const rows = lines || [];
    rows.forEach((l, idx) => {
      window.addExcelRow();
      const newRow = tbody.lastElementChild;
      if (!newRow) return;

      newRow.querySelector('.grid-month').value = l.receipt_month || '';
      newRow.querySelector('.grid-inv-type').value = l.item_category || '無';
      newRow.querySelector('.grid-inv-num').value = l.invoice_number || '';
      newRow.querySelector('.grid-item-category').value = l.item_category || '';
      newRow.querySelector('.grid-category-note').value = l.item_category_note || '';
      newRow.querySelector('.grid-amount').value = l.amount || 0;
      newRow.querySelector('.grid-payee-id').value = l.payee_identifier || '';
      newRow.querySelector('.grid-payee-name').innerText = l.payee_name || '';
      newRow.querySelector('.line-account-code').value = l.account_code || '';
      newRow.querySelector('.grid-proxy-check').checked = l.is_proxy_payment || false;
      newRow.querySelector('.grid-proxy-id').value = l.proxy_payer_identifier || '';
      newRow.querySelector('.grid-proxy-name').innerText = l.proxy_payer_name ? `代付人：${l.proxy_payer_name}` : '';
      
      if (l.is_proxy_payment) {
        newRow.querySelector('.grid-proxy-id').style.display = 'block';
        newRow.querySelector('.grid-proxy-name').style.display = 'block';
      }

      const inv = invoices?.find(inv => inv.amount === l.amount);
      if (inv) {
        newRow.querySelector('.grid-inv-type').value = inv.invoice_type;
        newRow.querySelector('.grid-inv-num').value = inv.invoice_number || '';
        newRow.querySelector('.grid-inv-num').disabled = inv.invoice_type !== '發票';
        newRow.querySelector('.grid-inv-num').required = inv.invoice_type === '發票';
      }

      if (attachments && attachments[idx]) {
        window.assignLineAttachment(newRow.dataset.rowId, attachments[idx]);
      }
    });

    if (rows.length === 0) {
      for(let i=0; i<3; i++) window.addExcelRow();
    }

    calculateVoucherTotal();
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    console.error(err);
    alert('開啟重送表單失敗：' + err.message);
  }
};

/**
 * 完整重送提交
 */
window.submitFullResubmission = async (e) => {
  e.preventDefault();
  
  const voucherId = document.getElementById('resubmitVoucherId')?.value;
  if (!voucherId) return;

  try {
    const currentVch = await supabase.from('vouchers').select('status').eq('id', voucherId).single();
    const fromStatus = currentVch.data?.status || 'rejected';

    const txDate = document.getElementById('vDate')?.value || new Date().toISOString().split('T')[0];
    const projectId = document.getElementById('vProject')?.value || null;
    const generalSummary = document.getElementById('vTitle')?.value.trim() || "批量多行核銷單據";
    const departmentId = document.getElementById('vDepartment')?.value || null;
    const managerId = document.getElementById('vManagerPicker')?.value || null;
    const tripStart = document.getElementById('vTripStart')?.value || null;
    const tripEnd = document.getElementById('vTripEnd')?.value || null;
    
    const rows = document.querySelectorAll('#excelLinesBody tr');
    let detailLines = [];
    let invoiceLines = [];
    let calculatedTotal = 0;

    rows.forEach((row) => {
      const descInput = row.querySelector('.grid-category-note');
      const categorySelect = row.querySelector('.grid-item-category');
      const amtInput = row.querySelector('.grid-amount');
      const invTypeInput = row.querySelector('.grid-inv-type');
      const invNumInput = row.querySelector('.grid-inv-num');
      const accountSelect = row.querySelector('.line-account-code');
      const payeeIdInput = row.querySelector('.grid-payee-id');
      const payeeNameSpan = row.querySelector('.grid-payee-name');
      const proxyCheck = row.querySelector('.grid-proxy-check');
      const proxyIdInput = row.querySelector('.grid-proxy-id');
      const proxyNameSpan = row.querySelector('.grid-proxy-name');

      const amt = Number(amtInput?.value || 0);
      const category = categorySelect ? categorySelect.value : '';
      const categoryNote = category === '其他' ? (descInput?.value.trim() || '') : '';
      const description = category === '其他' ? categoryNote : category;

      if (!description || amt <= 0) return;

      calculatedTotal += amt;

      detailLines.push({
        description,
        item_category: category,
        item_category_note: categoryNote,
        account_code: accountSelect ? (accountSelect.value || null) : null,
        amount: amt,
        payee_identifier: payeeIdInput?.value.trim() || null,
        payee_name: payeeNameSpan?.innerText.includes('查無') ? null : (payeeNameSpan?.innerText || null),
        is_proxy_payment: proxyCheck?.checked || false,
        proxy_payer_identifier: proxyCheck?.checked ? (proxyIdInput?.value.trim() || null) : null,
        proxy_payer_name: proxyCheck?.checked ? (proxyNameSpan?.innerText.replace('代付人：', '') || null) : null
      });

      const invType = invTypeInput ? invTypeInput.value : '無';
      if (invType !== '無') {
        const taxInfo = calcInvoiceTax(invType, amt);
        invoiceLines.push({
          invoice_type: invType,
          invoice_number: invNumInput?.value.trim() || null,
          amount: amt,
          tax_amount: taxInfo.taxAmount
        });
      }
    });

    if (detailLines.length === 0) {
      throw new Error('請至少填寫一筆有效的摘要與金額！');
    }

    const attachmentsMap = typeof voucherLineAttachments !== 'undefined' ? voucherLineAttachments : {};

    const voucherPayload = {
      txDate: txDate,
      projectId: projectId && projectId !== 'all' ? projectId : null,
      applicantId: window.state?.currentUser?.id,
      departmentId: departmentId,
      currentManagerId: managerId,
      category: '營業',
      summary: generalSummary,
      totalAmount: calculatedTotal,
      status: 'pending_review',
      detailLines: detailLines,
      invoiceLines: invoiceLines,
      attachmentsMap: attachmentsMap,
      rows: rows,
      tripStartDate: tripStart,
      tripEndDate: tripEnd
    };

    const result = await updateVoucher(voucherId, voucherPayload);

    if (!result || !result.success) {
      throw new Error(result?.error || '更新報支單失敗');
    }

    await logWorkflow(voucherId, 'resubmit', fromStatus, 'pending_review');

    alert(`✅ 重送成功！總計金額：$${calculatedTotal.toLocaleString()}`);

    document.getElementById('voucherCreateForm').reset();
    const tbody = document.getElementById('excelLinesBody');
    if (tbody) tbody.innerHTML = '';
    for(let i = 0; i < 3; i++) {
      if (typeof window.addExcelRow === 'function') window.addExcelRow();
    }

    renderDashboard();
    if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();

  } catch (err) {
    console.error(err);
    alert('重送報支單失敗：' + err.message);
  }
};
