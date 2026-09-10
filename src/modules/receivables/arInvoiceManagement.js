const PAGE_SIZE = 50;
const CUSTOMER_RESULT_LIMIT = 20;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatAmount(value, currency = 'TWD') {
  return `${currency} ${Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}

function addDays(dateText, days) {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function createOption(select, text, value, selected = false) {
  const option = new Option(text, value, selected, selected);
  select.add(option);
  return option;
}

export async function fetchArInvoicePage(client, { page = 0, status = '', search = '' } = {}) {
  if (!Number.isInteger(page) || page < 0) throw new Error('無效頁碼');
  let query = client.from('ar_invoices')
    .select('*, customer:customers(customer_no,name)', { count: 'exact' })
    .order('issue_date', { ascending: false })
    .order('draft_no', { ascending: false });
  if (status) query = query.eq('status', status);
  const cleanSearch = search.trim().replace(/[\\,%()"']/g, '').slice(0, 80);
  if (cleanSearch) {
    query = query.or(`draft_no.ilike.%${cleanSearch}%,invoice_no.ilike.%${cleanSearch}%,tax_invoice_no.ilike.%${cleanSearch}%`);
  }
  const { data, count, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw error;
  if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error('應收發票查詢未回傳完整結果');
  const expected = Math.min(PAGE_SIZE, Math.max(0, count - page * PAGE_SIZE));
  if (data.length !== expected) throw new Error('應收發票清單不完整，請重新載入');
  return { rows: data, count };
}

async function fetchInvoiceDetail(client, id) {
  const invoiceResult = await client.from('ar_invoices').select('*').eq('id', id).single();
  if (invoiceResult.error) throw invoiceResult.error;
  if (!invoiceResult.data) throw new Error('找不到應收發票');
  const [linesResult, customerResult] = await Promise.all([
    client.from('ar_invoice_lines').select('*').eq('invoice_id', id).order('line_no'),
    client.from('customers').select('id,customer_no,name,default_currency,payment_terms_days,department_id,credit_limit,status')
      .eq('id', invoiceResult.data.customer_id).single()
  ]);
  if (linesResult.error) throw linesResult.error;
  if (customerResult.error) throw customerResult.error;
  if (!Array.isArray(linesResult.data) || !linesResult.data.length || linesResult.data.length > 200) {
    throw new Error('發票明細不完整，請重新載入');
  }
  return { invoice: invoiceResult.data, lines: linesResult.data, customer: customerResult.data };
}

async function searchCustomers(client, term, selectedCustomer) {
  let query = client.from('customers')
    .select('id,customer_no,name,default_currency,payment_terms_days,department_id,credit_limit,status')
    .eq('status', 'active')
    .order('name')
    .limit(CUSTOMER_RESULT_LIMIT);
  if (term.trim()) query = query.ilike('name', `%${term.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const { data, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (selectedCustomer && !rows.some(row => row.id === selectedCustomer.id)) rows.unshift(selectedCustomer);
  return rows;
}

function buildLineRow(accounts, values = {}) {
  const row = document.createElement('tr');
  row.innerHTML = `<td><input data-description type="text" maxlength="500" required></td>
    <td><input data-quantity type="number" min="0.000001" step="0.000001" required></td>
    <td><input data-unit-price type="number" min="0" step="0.000001" required></td>
    <td><input data-net type="number" step="0.01" readonly></td>
    <td><input data-tax type="number" min="0" step="0.01" required></td>
    <td><select data-revenue required></select></td>
    <td><button data-remove type="button" class="icon-button" title="刪除明細" aria-label="刪除明細">&times;</button></td>`;
  row.querySelector('[data-description]').value = values.description || '';
  row.querySelector('[data-quantity]').value = values.quantity ?? 1;
  row.querySelector('[data-unit-price]').value = values.unit_price ?? '';
  row.querySelector('[data-net]').value = values.net_amount ?? '';
  row.querySelector('[data-tax]').value = values.tax_amount ?? 0;
  const accountSelect = row.querySelector('[data-revenue]');
  createOption(accountSelect, '請選擇收入科目', '');
  accounts.forEach(account => createOption(accountSelect, `${account.code} ${account.name}`, account.id,
    account.id === values.revenue_account_id));
  const recalculate = () => {
    const quantity = Number(row.querySelector('[data-quantity]').value);
    const price = Number(row.querySelector('[data-unit-price]').value);
    row.querySelector('[data-net]').value = Number.isFinite(quantity) && Number.isFinite(price)
      ? roundMoney(quantity * price).toFixed(2) : '';
    row.dispatchEvent(new CustomEvent('linechange', { bubbles: true }));
  };
  row.querySelector('[data-quantity]').addEventListener('input', recalculate);
  row.querySelector('[data-unit-price]').addEventListener('input', recalculate);
  row.querySelector('[data-tax]').addEventListener('input', () => row.dispatchEvent(new CustomEvent('linechange', { bubbles: true })));
  row.querySelector('[data-remove]').addEventListener('click', () => {
    const parent = row.parentElement;
    row.remove();
    parent?.dispatchEvent(new CustomEvent('linechange', { bubbles: true }));
  });
  return row;
}

function readLines(body) {
  return [...body.querySelectorAll('tr')].map(row => ({
    description: row.querySelector('[data-description]').value.trim(),
    quantity: Number(row.querySelector('[data-quantity]').value),
    unit_price: Number(row.querySelector('[data-unit-price]').value),
    net_amount: Number(row.querySelector('[data-net]').value),
    tax_amount: Number(row.querySelector('[data-tax]').value),
    revenue_account_id: row.querySelector('[data-revenue]').value
  }));
}

export function mountArInvoiceManagement(root, { client, canManage, getDepartments, getProjects, confirmAction = window.confirm }) {
  if (!root || !canManage()) return;
  root.innerHTML = `<h2>應收發票</h2>
    <form data-search class="ar-toolbar"><label for="ar-search">單號搜尋<input id="ar-search" name="search" type="search" maxlength="80"></label>
      <label for="ar-status-filter">狀態<select id="ar-status-filter" name="status"><option value="">全部</option><option value="draft">草稿</option>
      <option value="issued">已開立</option><option value="partially_paid">部分收款</option><option value="paid">已收款</option><option value="void">作廢</option></select></label>
      <button type="submit">查詢</button><button type="button" data-new>新增發票</button></form>
    <p data-status role="status"></p><div data-editor></div>
    <div class="table-wrapper"><table><thead><tr><th>草稿／發票號碼</th><th>客戶</th><th>發票日期</th><th>到期日</th><th>幣別金額</th><th>狀態</th><th>操作</th></tr></thead><tbody></tbody></table></div>
    <div class="ar-toolbar"><button type="button" data-prev aria-label="上一頁">上一頁</button><span data-page></span><button type="button" data-next aria-label="下一頁">下一頁</button></div>`;
  const searchForm = root.querySelector('[data-search]');
  const statusText = root.querySelector('[data-status]');
  const editor = root.querySelector('[data-editor]');
  const body = root.querySelector('tbody');
  const previous = root.querySelector('[data-prev]');
  const next = root.querySelector('[data-next]');
  let page = 0, generation = 0, editing = false, saving = false;
  let filters = { search: '', status: '' };
  const alive = () => root.isConnected && root.querySelector('[data-search]') === searchForm && canManage();

  async function refresh() {
    const version = ++generation;
    body.replaceChildren(); previous.disabled = next.disabled = true; statusText.textContent = '載入應收發票...';
    root.querySelector('[data-page]').textContent = '';
    try {
      const result = await fetchArInvoicePage(client, { ...filters, page });
      if (!alive() || version !== generation) return;
      if (page > 0 && !result.rows.length) { page = 0; return refresh(); }
      for (const invoice of result.rows) {
        const row = document.createElement('tr');
        const numberCell = document.createElement('td');
        const primaryNumber = document.createElement('strong'); primaryNumber.textContent = invoice.invoice_no || invoice.draft_no;
        numberCell.append(primaryNumber);
        if (invoice.tax_invoice_no) { const taxNumber = document.createElement('small'); taxNumber.textContent = invoice.tax_invoice_no; numberCell.append(taxNumber); }
        const values = [invoice.customer?.name || invoice.customer?.customer_no || '', invoice.issue_date, invoice.due_date,
          formatAmount(invoice.total_amount, invoice.currency), ({draft:'草稿',issued:'已開立',partially_paid:'部分收款',paid:'已收款',void:'作廢'})[invoice.status] || invoice.status];
        row.append(numberCell);
        values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value || ''; row.append(cell); });
        const actionCell = document.createElement('td');
        const open = document.createElement('button'); open.type = 'button'; open.textContent = invoice.status === 'draft' ? '編輯' : '查看';
        open.onclick = () => openEditor(invoice.id); actionCell.append(open);
        if (invoice.status === 'draft') {
          const issue = document.createElement('button'); issue.type = 'button'; issue.textContent = '開立';
          issue.onclick = () => issueInvoice(invoice); actionCell.append(issue);
        }
        row.append(actionCell); body.append(row);
      }
      statusText.textContent = result.count ? `共 ${result.count} 張應收發票` : '目前沒有應收發票';
      root.querySelector('[data-page]').textContent = `${page + 1} / ${Math.max(1, Math.ceil(result.count / PAGE_SIZE))}`;
      previous.disabled = page === 0; next.disabled = (page + 1) * PAGE_SIZE >= result.count;
    } catch (error) { if (alive() && version === generation) statusText.textContent = `載入失敗：${error.message}`; }
  }

  async function issueInvoice(invoice) {
    if (saving || editing || !alive() || !confirmAction(`確定正式開立 ${invoice.draft_no}？開立後會產生會計分錄且不能編輯。`)) return;
    saving = true; statusText.textContent = '開立中...';
    try {
      const { data, error } = await client.rpc('issue_ar_invoice', { p_id: invoice.id, p_expected_revision: invoice.revision });
      if (error) throw error;
      if (!data || data.status !== 'issued' || data.revision !== invoice.revision + 1) throw new Error('開立結果未確認，請重新查詢');
      statusText.textContent = `已開立 ${data.invoice_no}`; editor.replaceChildren(); editing = false;
      await refresh();
    } catch (error) { if (alive()) statusText.textContent = `開立失敗：${error.message}`; }
    finally { saving = false; }
  }

  async function openEditor(invoiceId = null) {
    if (!alive() || editing || saving) return;
    editing = true; editor.textContent = '載入發票表單...';
    try {
      const detail = invoiceId ? await fetchInvoiceDetail(client, invoiceId) : null;
      const [departments, projects, accountsResult] = await Promise.all([
        getDepartments(), getProjects(), client.from('accounts').select('id,code,name,type').eq('type', 'revenue').order('code')
      ]);
      if (!alive()) return;
      if (accountsResult.error) throw accountsResult.error;
      const accounts = accountsResult.data || [];
      if (!accounts.length) throw new Error('沒有可用的收入科目');
      const invoice = detail?.invoice || null;
      const readonly = invoice && invoice.status !== 'draft';
      const id = invoice?.id || crypto.randomUUID();
      const revision = invoice?.revision || 0;
      const form = document.createElement('form'); form.className = 'ar-invoice-form';
      form.innerHTML = `<h3>${readonly ? '查看應收發票' : invoice ? '編輯應收發票草稿' : '新增應收發票草稿'}</h3>
        <div class="ar-invoice-grid">
          <label for="ar-customer-search">客戶名稱搜尋<input id="ar-customer-search" type="search" maxlength="200"></label>
          <label for="ar-customer">客戶<select id="ar-customer" name="customer_id" required></select></label>
          <label for="ar-tax-number">統一發票號碼<input id="ar-tax-number" name="tax_invoice_no" maxlength="80"></label>
          <label for="ar-issue-date">發票日期<input id="ar-issue-date" name="issue_date" type="date" required></label>
          <label for="ar-due-date">到期日<input id="ar-due-date" name="due_date" type="date" required></label>
          <label for="ar-currency">幣別<input id="ar-currency" name="currency" readonly required></label>
          <label for="ar-project">專案<select id="ar-project" name="project_id"></select></label>
          <label for="ar-department">部門<select id="ar-department" name="department_id"></select></label>
          <label class="ar-wide" for="ar-memo">備註<textarea id="ar-memo" name="memo" maxlength="2000"></textarea></label>
        </div>
        <div class="table-wrapper"><table class="ar-lines"><thead><tr><th>收入項目</th><th>數量</th><th>單價</th><th>未稅金額</th><th>稅額</th><th>收入科目</th><th></th></tr></thead><tbody></tbody></table></div>
        <div class="ar-form-actions"><button type="button" data-add-line>新增項目</button><strong data-total></strong>
          <button type="submit" data-save>儲存草稿</button><button type="button" data-cancel>關閉</button></div>
        <p data-form-status role="status"></p>`;
      const customerSearch = form.querySelector('#ar-customer-search');
      const customerSelect = form.querySelector('#ar-customer');
      const issueDate = form.querySelector('#ar-issue-date');
      const dueDate = form.querySelector('#ar-due-date');
      const currency = form.querySelector('#ar-currency');
      const projectSelect = form.querySelector('#ar-project');
      const departmentSelect = form.querySelector('#ar-department');
      const linesBody = form.querySelector('.ar-lines tbody');
      const formStatus = form.querySelector('[data-form-status]');
      let customers = [];
      let customerTimer;
      let customerSearchVersion = 0;
      createOption(projectSelect, '未指定專案', '');
      (projects || []).forEach(project => createOption(projectSelect, `${project.project_code || ''} ${project.name}`.trim(), project.id,
        project.id === invoice?.project_id));
      createOption(departmentSelect, '未指定部門', '');
      (departments || []).forEach(department => createOption(departmentSelect, department.display_name || department.name, department.id,
        department.id === invoice?.department_id));
      form.querySelector('#ar-tax-number').value = invoice?.tax_invoice_no || '';
      issueDate.value = invoice?.issue_date || new Date().toISOString().slice(0, 10);
      dueDate.value = invoice?.due_date || '';
      currency.value = invoice?.currency || detail?.customer?.default_currency || '';
      form.querySelector('#ar-memo').value = invoice?.memo || '';

      const renderCustomerOptions = rows => {
        const current = customerSelect.value || invoice?.customer_id || '';
        customerSelect.replaceChildren(); createOption(customerSelect, '請選擇客戶', '');
        rows.forEach(customer => createOption(customerSelect, `${customer.customer_no} ${customer.name}`, customer.id, customer.id === current));
        if (current && rows.some(customer => customer.id === current)) customerSelect.value = current;
      };
      const loadCustomers = async term => {
        const version = ++customerSearchVersion; formStatus.textContent = '搜尋客戶...';
        try {
          const rows = await searchCustomers(client, term, detail?.customer);
          if (!alive() || version !== customerSearchVersion) return;
          customers = rows; renderCustomerOptions(rows);
          formStatus.textContent = rows.length >= CUSTOMER_RESULT_LIMIT ? '顯示前 20 筆，請輸入更多名稱縮小範圍' : '';
        } catch (error) { if (alive() && version === customerSearchVersion) formStatus.textContent = `客戶搜尋失敗：${error.message}`; }
      };
      customerSearch.addEventListener('input', () => {
        clearTimeout(customerTimer); customerTimer = setTimeout(() => loadCustomers(customerSearch.value), 250);
      });
      customerSelect.addEventListener('change', () => {
        const customer = customers.find(row => row.id === customerSelect.value);
        if (!customer) return;
        currency.value = customer.default_currency;
        if (!invoice) dueDate.value = addDays(issueDate.value, customer.payment_terms_days);
        if (!departmentSelect.value && customer.department_id) departmentSelect.value = customer.department_id;
      });
      issueDate.addEventListener('change', () => {
        const customer = customers.find(row => row.id === customerSelect.value);
        if (!invoice && customer) dueDate.value = addDays(issueDate.value, customer.payment_terms_days);
      });
      projectSelect.addEventListener('change', () => {
        const project = (projects || []).find(row => row.id === projectSelect.value);
        if (project?.department_id) departmentSelect.value = project.department_id;
      });
      const updateTotal = () => {
        const lines = readLines(linesBody);
        const total = lines.reduce((sum, line) => sum + (Number.isFinite(line.net_amount) ? line.net_amount : 0)
          + (Number.isFinite(line.tax_amount) ? line.tax_amount : 0), 0);
        form.querySelector('[data-total]').textContent = `總額 ${formatAmount(roundMoney(total), currency.value || 'TWD')}`;
      };
      linesBody.addEventListener('linechange', updateTotal);
      const addLine = values => {
        if (linesBody.rows.length >= 200) { formStatus.textContent = '每張發票最多 200 筆收入項目'; return; }
        linesBody.append(buildLineRow(accounts, values)); updateTotal();
      };
      (detail?.lines || [{}]).forEach(addLine);
      form.querySelector('[data-add-line]').onclick = () => addLine({});
      form.querySelector('[data-cancel]').onclick = () => {
        if (!saving) { clearTimeout(customerTimer); editor.replaceChildren(); editing = false; }
      };
      form.onsubmit = async event => {
        event.preventDefault();
        if (saving || readonly || !alive()) return;
        const lines = readLines(linesBody);
        if (!lines.length) { formStatus.textContent = '請至少新增一筆收入項目'; return; }
        if (lines.some(line => !line.description || !line.revenue_account_id || !Number.isFinite(line.quantity) || line.quantity <= 0 ||
          !Number.isFinite(line.unit_price) || line.unit_price < 0 || !Number.isFinite(line.net_amount) || line.net_amount <= 0 ||
          !Number.isFinite(line.tax_amount) || line.tax_amount < 0)) {
          formStatus.textContent = '請完整填寫每一筆收入項目、金額、稅額與收入科目'; return;
        }
        const fields = new FormData(form);
        const payload = {
          tax_invoice_no: fields.get('tax_invoice_no'), customer_id: fields.get('customer_id'),
          project_id: fields.get('project_id'), department_id: fields.get('department_id'),
          issue_date: fields.get('issue_date'), due_date: fields.get('due_date'), currency: fields.get('currency'), memo: fields.get('memo')
        };
        saving = true; formStatus.textContent = '儲存中...';
        form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
        try {
          const { data, error } = await client.rpc('save_ar_invoice_draft', {
            p_id: id, p_expected_revision: revision, p_invoice: payload, p_lines: lines
          });
          if (error) throw error;
          if (!data || data.id !== id || data.revision !== revision + 1 || data.status !== 'draft') {
            throw new Error('儲存結果未確認，請關閉表單後重新查詢');
          }
          if (!alive()) return;
          editor.textContent = `已儲存 ${data.draft_no}`; editing = false; await refresh();
        } catch (error) { if (alive()) formStatus.textContent = `儲存失敗：${error.message}`; }
        finally {
          saving = false;
          form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = false; });
          currency.readOnly = true;
        }
      };
      if (readonly) {
        form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
        form.querySelector('[data-cancel]').disabled = false;
        form.querySelector('[data-save]').hidden = true;
        form.querySelector('[data-add-line]').hidden = true;
        form.querySelectorAll('[data-remove]').forEach(button => { button.hidden = true; });
      }
      editor.replaceChildren(form); await loadCustomers(''); updateTotal();
      if (!readonly) customerSearch.focus();
    } catch (error) { if (alive()) { editor.textContent = `表單載入失敗：${error.message}`; editing = false; } }
  }

  searchForm.onsubmit = event => {
    event.preventDefault(); filters = { search: searchForm.elements.search.value, status: searchForm.elements.status.value }; page = 0; refresh();
  };
  previous.onclick = () => { if (page > 0) { page--; refresh(); } };
  next.onclick = () => { page++; refresh(); };
  root.querySelector('[data-new]').onclick = () => openEditor();
  refresh();
}
