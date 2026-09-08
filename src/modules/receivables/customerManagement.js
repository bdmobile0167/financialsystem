const PAGE_SIZE = 50;
const FIELDS = ['name','tax_id','contact_person','email','phone','address','department_id','default_currency','payment_terms_days','credit_limit','status'];

export async function fetchCustomerPage(client, { page = 0, search = '', status = '' } = {}) {
  if (!Number.isInteger(page) || page < 0) throw new Error('無效頁碼');
  let query = client.from('customers').select('*', { count: 'exact' }).order('customer_no').order('id');
  if (search.trim()) query = query.ilike('name', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw error;
  if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error('客戶查詢未回傳完整結果');
  const expected = Math.min(PAGE_SIZE, Math.max(0, count - page * PAGE_SIZE));
  if (data.length !== expected) throw new Error('客戶清單不完整，請重新載入');
  return { rows: data, count };
}

export function mountCustomerManagement(root, { client, canManage, getDepartments }) {
  if (!root || !canManage()) return;
  root.innerHTML = `<h2>客戶管理</h2>
    <form data-search class="customer-toolbar"><label>客戶名稱<input name="search" type="search" maxlength="200"></label>
      <label>狀態<select name="status"><option value="">全部</option><option value="active">啟用</option><option value="inactive">停用</option></select></label>
      <button type="submit">查詢</button><button type="button" data-new>新增客戶</button></form>
    <p data-status role="status"></p><div data-editor></div>
    <div class="table-wrapper"><table><thead><tr><th>編號</th><th>客戶名稱</th><th>統編</th><th>幣別</th><th>帳期</th><th>狀態</th><th>操作</th></tr></thead><tbody></tbody></table></div>
    <div class="customer-toolbar"><button type="button" data-prev aria-label="上一頁">上一頁</button><span data-page></span><button type="button" data-next aria-label="下一頁">下一頁</button></div>`;
  const searchForm = root.querySelector('[data-search]');
  const status = root.querySelector('[data-status]');
  const editor = root.querySelector('[data-editor]');
  const body = root.querySelector('tbody');
  const previous = root.querySelector('[data-prev]');
  const next = root.querySelector('[data-next]');
  let page = 0, generation = 0, editing = false, saving = false;
  let filters = { search: '', status: '' };
  const alive = () => root.isConnected && root.querySelector('[data-search]') === searchForm && canManage();

  async function refresh() {
    const version = ++generation;
    body.replaceChildren(); previous.disabled = next.disabled = true;
    status.textContent = '載入客戶...';
    root.querySelector('[data-page]').textContent = '';
    try {
      const result = await fetchCustomerPage(client, { ...filters, page });
      if (!alive() || version !== generation) return;
      if (page > 0 && !result.rows.length) { page = 0; return refresh(); }
      for (const customer of result.rows) {
        const row = document.createElement('tr');
        [customer.customer_no, customer.name, customer.tax_id || '', customer.default_currency,
          `${customer.payment_terms_days} 天`, customer.status === 'active' ? '啟用' : '停用'].forEach(value => {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        });
        const cell = document.createElement('td');
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '編輯';
        button.onclick = () => edit(customer); cell.append(button); row.append(cell); body.append(row);
      }
      status.textContent = result.count ? `共 ${result.count} 位客戶` : '沒有符合條件的客戶';
      root.querySelector('[data-page]').textContent = `${page + 1} / ${Math.max(1, Math.ceil(result.count / PAGE_SIZE))}`;
      previous.disabled = page === 0; next.disabled = (page + 1) * PAGE_SIZE >= result.count;
    } catch (error) { if (alive() && version === generation) status.textContent = `載入失敗：${error.message}`; }
  }

  async function edit(customer = null) {
    if (!alive() || editing || saving) return;
    editing = true;
    editor.textContent = '載入客戶表單...';
    try {
      const [departments, currencyResult] = await Promise.all([
        getDepartments(), client.from('currencies').select('code,name,is_active').order('code')
      ]);
      if (!alive()) return;
      if (currencyResult.error) throw currencyResult.error;
      if (customer?.department_id && !departments.some(department => department.id === customer.department_id)) {
        throw new Error('原客戶部門未載入，不能儲存空白部門覆蓋原資料');
      }
      const id = customer?.id || crypto.randomUUID();
      const revision = customer?.revision || 0;
      const form = document.createElement('form'); form.className = 'customer-edit-form';
      const title = document.createElement('h3'); title.textContent = customer ? `編輯 ${customer.customer_no}` : '新增客戶';
      form.append(title);
      const definitions = [
        ['name','客戶名稱','text',200],['tax_id','統一編號','text',254],['contact_person','聯絡人','text',254],
        ['email','電子郵件','email',254],['phone','電話','text',254],['address','地址','text',1000],
        ['department_id','所屬部門','select'],['default_currency','預設幣別','select'],
        ['payment_terms_days','帳期天數','number'],['credit_limit','信用額度','number'],['status','狀態','select']
      ];
      for (const [name, labelText, type, length] of definitions) {
        const label = document.createElement('label'); label.textContent = labelText;
        const input = document.createElement(type === 'select' ? 'select' : 'input');
        input.name = name; input.id = `customer-${name}`; label.htmlFor = input.id;
        if (type !== 'select') input.type = type;
        if (length) input.maxLength = length;
        if (type === 'number') { input.min = '0'; input.step = name === 'credit_limit' ? '0.01' : '1'; }
        if (name === 'payment_terms_days') input.max = '3650';
        if (name === 'name' || name === 'payment_terms_days' || name === 'default_currency') input.required = true;
        if (name === 'department_id') {
          input.add(new Option('未指定',''));
          departments.forEach(department => input.add(new Option(department.name,department.id)));
        }
        if (name === 'default_currency') (currencyResult.data || []).forEach(currency => {
          const option = new Option(`${currency.code} ${currency.name}${currency.is_active ? '' : '（停用）'}`,currency.code);
          option.disabled = !currency.is_active; input.add(option);
        });
        if (name === 'status') { input.add(new Option('啟用','active')); input.add(new Option('停用','inactive')); }
        input.value = customer?.[name] ?? ({default_currency:'TWD',payment_terms_days:30,status:'active'}[name] ?? '');
        label.append(input); form.append(label);
      }
      const message = document.createElement('p'); message.setAttribute('role','status');
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = '儲存客戶';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
      cancel.onclick = () => { if (!saving) { editor.replaceChildren(); editing = false; } };
      form.append(message,save,cancel); editor.replaceChildren(form);
      form.onsubmit = async event => {
        event.preventDefault();
        if (saving || !alive()) return;
        const fields = new FormData(form);
        const payload = Object.fromEntries(FIELDS.map(field => [field, fields.get(field)]));
        payload.payment_terms_days = Number(payload.payment_terms_days);
        payload.credit_limit = payload.credit_limit === '' ? null : payload.credit_limit;
        saving = true; message.textContent = '儲存中...';
        form.querySelectorAll('input,select,button').forEach(control => { control.disabled = true; });
        try {
          const { data, error } = await client.rpc('save_ar_customer', {p_id:id,p_expected_revision:revision,p_customer:payload});
          if (error) throw error;
          if (!data || data.id !== id || data.revision !== revision + 1) throw new Error('儲存結果未確認，請取消後查詢客戶狀態');
          if (!alive()) return;
          editor.textContent = `已儲存 ${data.customer_no}`; editing = false;
          await refresh();
        } catch (error) { if (alive()) message.textContent = error.message; }
        finally {
          saving = false;
          form.querySelectorAll('input,select,button').forEach(control => { control.disabled = false; });
        }
      };
      form.querySelector('input').focus();
    } catch (error) { if (alive()) { editor.textContent = `表單載入失敗：${error.message}`; editing = false; } }
  }
  searchForm.onsubmit = event => {
    event.preventDefault(); filters = {search:searchForm.elements.search.value,status:searchForm.elements.status.value}; page = 0; refresh();
  };
  previous.onclick = () => { if (page > 0) { page--; refresh(); } };
  next.onclick = () => { page++; refresh(); };
  root.querySelector('[data-new]').onclick = () => edit();
  refresh();
}
