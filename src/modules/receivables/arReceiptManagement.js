const PAGE_SIZE = 50;
const MAX_ALLOCATIONS = 200;

function formatAmount(value, currency = 'TWD') {
  return `${currency} ${Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function toLocalDateInputValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addOption(select, label, value, selected = false) {
  select.add(new Option(label, value, selected, selected));
}

export async function fetchArReceiptPage(client, { page = 0, search = '' } = {}) {
  if (!Number.isInteger(page) || page < 0) throw new Error('無效頁碼');
  let query = client.from('ar_receipts')
    .select('*, customer:customers(customer_no,name), bank:bank_accounts(bank_name,nickname,account_number)', { count: 'exact' })
    .order('receipt_date', { ascending: false }).order('receipt_no', { ascending: false });
  if (search.trim()) query = query.ilike('receipt_no', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const { data, count, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw error;
  if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error('AR 收款查詢未回傳完整結果');
  const expected = Math.min(PAGE_SIZE, Math.max(0, count - page * PAGE_SIZE));
  if (data.length !== expected) throw new Error('AR 收款清單不完整，請重新載入');
  return { rows: data, count };
}

async function searchCustomers(client, term) {
  let query = client.from('customers')
    .select('id,customer_no,name,default_currency,payment_terms_days,status')
    .eq('status', 'active').order('name').limit(20);
  if (term.trim()) query = query.ilike('name', `%${term.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchOutstandingInvoices(client, customerId, search) {
  let query = client.from('ar_invoice_balances').select('*', { count: 'exact' })
    .eq('customer_id', customerId).gt('outstanding_amount', 0)
    .in('status', ['issued', 'partially_paid']).order('due_date').order('invoice_id').limit(MAX_ALLOCATIONS);
  const clean = search.trim().replace(/[\\,%()"']/g, '').slice(0, 80);
  if (clean) query = query.or(`invoice_no.ilike.%${clean}%,tax_invoice_no.ilike.%${clean}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error('未收發票查詢未回傳完整結果');
  return { rows: data, count };
}

async function fetchReceiptDetail(client, id) {
  const [receiptResult, allocationsResult] = await Promise.all([
    client.from('ar_receipts').select('*, customer:customers(customer_no,name), bank:bank_accounts(bank_name,nickname,account_number)').eq('id', id).single(),
    client.from('ar_receipt_allocations').select('*, invoice:ar_invoices(invoice_no,draft_no,tax_invoice_no,total_amount,currency)').eq('receipt_id', id).order('created_at')
  ]);
  if (receiptResult.error) throw receiptResult.error;
  if (allocationsResult.error) throw allocationsResult.error;
  if (!receiptResult.data || !Array.isArray(allocationsResult.data) || !allocationsResult.data.length) {
    throw new Error('AR 收款明細不完整，請重新載入');
  }
  return { receipt: receiptResult.data, allocations: allocationsResult.data };
}

export function mountArReceiptManagement(root, { client, canManage, confirmAction = window.confirm }) {
  if (!root || !canManage()) return;
  root.innerHTML = `<h2>AR 收款</h2>
    <form data-search class="ar-toolbar"><label>收款單號<input name="search" type="search" maxlength="80"></label>
      <button type="submit">查詢</button><button type="button" data-new>登錄收款</button></form>
    <p data-status role="status"></p><div data-editor></div>
    <div class="table-wrapper"><table><thead><tr><th>收款單號</th><th>日期</th><th>客戶</th><th>收款銀行</th><th>原幣金額</th><th>台幣金額</th><th>狀態</th><th>操作</th></tr></thead><tbody></tbody></table></div>
    <div class="ar-toolbar"><button type="button" data-prev aria-label="上一頁">上一頁</button><span data-page></span><button type="button" data-next aria-label="下一頁">下一頁</button></div>`;
  const searchForm = root.querySelector('[data-search]');
  const statusText = root.querySelector('[data-status]');
  const editor = root.querySelector('[data-editor]');
  const body = root.querySelector('tbody');
  const previous = root.querySelector('[data-prev]');
  const next = root.querySelector('[data-next]');
  let page = 0, generation = 0, editing = false, saving = false, search = '';
  const alive = () => root.isConnected && root.querySelector('[data-search]') === searchForm && canManage();

  async function refresh() {
    const version = ++generation; body.replaceChildren(); previous.disabled = next.disabled = true;
    statusText.textContent = '載入 AR 收款...'; root.querySelector('[data-page]').textContent = '';
    try {
      const result = await fetchArReceiptPage(client, { page, search });
      if (!alive() || version !== generation) return;
      if (page > 0 && !result.rows.length) { page = 0; return refresh(); }
      for (const receipt of result.rows) {
        const row = document.createElement('tr');
        [receipt.receipt_no, receipt.receipt_date, receipt.customer?.name || receipt.customer?.customer_no || '',
          receipt.bank?.nickname || receipt.bank?.bank_name || '', formatAmount(receipt.amount, receipt.currency),
          formatAmount(receipt.amount_base, 'TWD'), receipt.status === 'posted' ? '已入帳' : '已沖銷'].forEach(value => {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        });
        const actionCell = document.createElement('td'); const view = document.createElement('button');
        view.type = 'button'; view.textContent = '查看'; view.onclick = () => viewReceipt(receipt.id); actionCell.append(view); row.append(actionCell); body.append(row);
      }
      statusText.textContent = result.count ? `共 ${result.count} 筆 AR 收款` : '目前沒有 AR 收款';
      root.querySelector('[data-page]').textContent = `${page + 1} / ${Math.max(1, Math.ceil(result.count / PAGE_SIZE))}`;
      previous.disabled = page === 0; next.disabled = (page + 1) * PAGE_SIZE >= result.count;
    } catch (error) { if (alive() && version === generation) statusText.textContent = `載入失敗：${error.message}`; }
  }

  async function viewReceipt(id) {
    if (!alive() || editing || saving) return; editing = true; editor.textContent = '載入收款明細...';
    try {
      const { receipt, allocations } = await fetchReceiptDetail(client, id);
      if (!alive()) return;
      const section = document.createElement('section'); section.className = 'ar-receipt-detail';
      const title = document.createElement('h3'); title.textContent = receipt.receipt_no;
      const summary = document.createElement('p');
      summary.textContent = `${receipt.receipt_date}｜${receipt.customer?.name || ''}｜${receipt.bank?.nickname || receipt.bank?.bank_name || ''}｜${formatAmount(receipt.amount, receipt.currency)}`;
      const reversalSummary = document.createElement('p');
      if (receipt.status === 'reversed') {
        reversalSummary.textContent = `已於 ${receipt.reversal_date || '-'} 沖銷｜原因：${receipt.reversal_reason || '-'}`;
      }
      const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrapper';
      const table = document.createElement('table'); table.innerHTML = '<thead><tr><th>發票號碼</th><th>沖銷金額</th><th>發票匯率</th><th>收款匯率</th><th>已實現匯差</th></tr></thead><tbody></tbody>';
      allocations.forEach(allocation => {
        const row = document.createElement('tr');
        [allocation.invoice?.invoice_no || allocation.invoice?.draft_no || '', formatAmount(allocation.amount, receipt.currency),
          allocation.invoice_exchange_rate, allocation.receipt_exchange_rate, formatAmount(allocation.realized_fx_base, 'TWD')]
          .forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
        table.querySelector('tbody').append(row);
      });
      tableWrap.append(table); const actions = document.createElement('div'); actions.className = 'ar-form-actions';
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '關閉';
      close.onclick = () => { editor.replaceChildren(); editing = false; };
      if (receipt.status === 'posted') {
        const reverseButton = document.createElement('button'); reverseButton.type = 'button'; reverseButton.className = 'danger';
        reverseButton.textContent = '沖銷收款';
        reverseButton.onclick = () => {
          if (saving || section.querySelector('[data-reversal-form]')) return;
          const form = document.createElement('form'); form.dataset.reversalForm = '1'; form.className = 'ar-reversal-form';
          form.innerHTML = `<label>沖銷日期<input name="reversal_date" type="date" min="${receipt.receipt_date}" required></label>
            <label>沖銷原因<textarea name="reason" minlength="2" maxlength="2000" required></textarea></label>
            <div class="ar-form-actions"><button type="submit" class="danger">確認沖銷</button><button type="button" data-cancel>取消</button></div>
            <p data-reversal-status role="status"></p>`;
          form.elements.reversal_date.value = [toLocalDateInputValue(), receipt.receipt_date].sort().at(-1);
          form.querySelector('[data-cancel]').onclick = () => { if (!saving) form.remove(); };
          form.onsubmit = async event => {
            event.preventDefault(); if (saving || !alive()) return;
            const reason = form.elements.reason.value.trim();
            if (reason.length < 2) { form.querySelector('[data-reversal-status]').textContent = '請填寫至少 2 個字的沖銷原因'; return; }
            if (!confirmAction(`確定沖銷收款 ${receipt.receipt_no}？系統會建立反向流水與分錄。`)) return;
            saving = true; form.querySelector('[data-reversal-status]').textContent = '收款沖銷中...';
            form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = true; });
            try {
              const { data, error } = await client.rpc('reverse_ar_receipt', {
                p_receipt_id: receipt.id,
                p_expected_revision: receipt.revision,
                p_reversal_date: form.elements.reversal_date.value,
                p_reason: reason
              });
              if (error) throw error;
              if (!data || data.id !== receipt.id || data.status !== 'reversed' ||
                  data.revision !== receipt.revision + 1 || !data.reversal_transaction_id) {
                throw new Error('沖銷結果未確認，請關閉明細後重新查詢');
              }
              if (!alive()) return;
              editor.textContent = `已沖銷 ${receipt.receipt_no}`; editing = false; await refresh();
            } catch (error) {
              if (alive()) form.querySelector('[data-reversal-status]').textContent = `沖銷失敗：${error.message}`;
            } finally {
              saving = false;
              form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = false; });
            }
          };
          section.append(form); form.elements.reason.focus();
        };
        actions.append(reverseButton);
      }
      actions.append(close);
      section.append(title, summary);
      if (receipt.status === 'reversed') section.append(reversalSummary);
      section.append(tableWrap, actions); editor.replaceChildren(section);
    } catch (error) { if (alive()) { editor.textContent = `明細載入失敗：${error.message}`; editing = false; } }
  }

  async function openEditor() {
    if (!alive() || editing || saving) return; editing = true; editor.textContent = '載入收款表單...';
    try {
      const [banksResult, initialCustomers] = await Promise.all([
        client.from('bank_accounts').select('id,bank_name,nickname,account_number,currency').order('bank_name'),
        searchCustomers(client, '')
      ]);
      if (!alive()) return;
      if (banksResult.error) throw banksResult.error;
      const banks = banksResult.data || [];
      if (!banks.length) throw new Error('沒有可用的收款銀行帳戶');
      const id = crypto.randomUUID();
      const form = document.createElement('form'); form.className = 'ar-receipt-form';
      form.innerHTML = `<h3>登錄 AR 收款</h3><div class="ar-invoice-grid">
        <label>客戶名稱搜尋<input data-customer-search type="search" maxlength="200"></label>
        <label>客戶<select name="customer_id" data-customer required></select></label>
        <label>收款銀行<select name="bank_account_id" data-bank required></select></label>
        <label>收款日期<input name="receipt_date" type="date" required></label>
        <label class="ar-wide">備註<textarea name="memo" maxlength="2000"></textarea></label></div>
        <div class="ar-toolbar"><label>發票號碼搜尋<input data-invoice-search type="search" maxlength="80"></label><button type="button" data-find>查詢未收發票</button></div>
        <div class="table-wrapper"><table class="ar-allocation-table"><thead><tr><th>發票號碼</th><th>日期／到期日</th><th>原始金額</th><th>已收</th><th>未收</th><th>本次沖銷</th></tr></thead><tbody></tbody></table></div>
        <div class="ar-form-actions"><strong data-total>收款合計 TWD 0</strong><button type="submit">確認收款入帳</button><button type="button" data-cancel>取消</button></div>
        <p data-form-status role="status"></p>`;
      const customerSearch = form.querySelector('[data-customer-search]');
      const customerSelect = form.querySelector('[data-customer]');
      const bankSelect = form.querySelector('[data-bank]');
      const invoiceSearch = form.querySelector('[data-invoice-search]');
      const allocationBody = form.querySelector('.ar-allocation-table tbody');
      const formStatus = form.querySelector('[data-form-status]');
      const allocations = new Map();
      let customers = initialCustomers, customerTimer, customerVersion = 0, invoiceVersion = 0;
      form.elements.receipt_date.value = toLocalDateInputValue();

      const renderCustomers = rows => {
        const current = customerSelect.value; customerSelect.replaceChildren(); addOption(customerSelect, '請選擇客戶', '');
        rows.forEach(customer => addOption(customerSelect, `${customer.customer_no} ${customer.name}`, customer.id, customer.id === current));
      };
      const renderBanks = customer => {
        const current = bankSelect.value; bankSelect.replaceChildren(); addOption(bankSelect, '請選擇同幣別銀行', '');
        banks.forEach(bank => {
          const option = new Option(`${bank.nickname || bank.bank_name} (${bank.account_number})｜${bank.currency}`, bank.id,
            false, bank.id === current && bank.currency === customer?.default_currency);
          option.disabled = Boolean(customer) && bank.currency !== customer.default_currency; bankSelect.add(option);
        });
      };
      renderCustomers(customers); renderBanks(null);
      const updateTotal = () => {
        const customer = customers.find(row => row.id === customerSelect.value);
        const total = [...allocations.values()].reduce((sum, amount) => sum + amount, 0);
        form.querySelector('[data-total]').textContent = `收款合計 ${formatAmount(roundMoney(total), customer?.default_currency || 'TWD')}`;
      };
      const renderInvoices = result => {
        allocationBody.replaceChildren();
        result.rows.forEach(invoice => {
          const row = document.createElement('tr');
          const values = [invoice.invoice_no || invoice.draft_no, `${invoice.issue_date} / ${invoice.due_date}`,
            formatAmount(invoice.total_amount, invoice.currency), formatAmount(invoice.paid_amount, invoice.currency),
            formatAmount(invoice.outstanding_amount, invoice.currency)];
          values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
          const amountCell = document.createElement('td'); const input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.max = String(invoice.outstanding_amount); input.step = '0.01';
          input.value = allocations.get(invoice.invoice_id) || ''; input.setAttribute('aria-label', `沖銷 ${invoice.invoice_no || invoice.draft_no}`);
          input.addEventListener('input', () => {
            const amount = Number(input.value);
            if (Number.isFinite(amount) && amount > 0) allocations.set(invoice.invoice_id, roundMoney(amount));
            else allocations.delete(invoice.invoice_id);
            updateTotal();
          });
          amountCell.append(input); row.append(amountCell); allocationBody.append(row);
        });
        formStatus.textContent = result.count > MAX_ALLOCATIONS
          ? `共有 ${result.count} 張未收發票，目前顯示前 ${MAX_ALLOCATIONS} 張，請輸入發票號碼縮小範圍`
          : result.count ? `共 ${result.count} 張未收發票` : '此客戶沒有符合條件的未收發票';
      };
      const loadInvoices = async () => {
        if (!customerSelect.value) { allocationBody.replaceChildren(); formStatus.textContent = '請先選擇客戶'; return; }
        const version = ++invoiceVersion; formStatus.textContent = '載入未收發票...';
        try {
          const result = await fetchOutstandingInvoices(client, customerSelect.value, invoiceSearch.value);
          if (!alive() || version !== invoiceVersion) return; renderInvoices(result);
        } catch (error) { if (alive() && version === invoiceVersion) formStatus.textContent = `發票載入失敗：${error.message}`; }
      };
      customerSearch.addEventListener('input', () => {
        clearTimeout(customerTimer); customerTimer = setTimeout(async () => {
          const version = ++customerVersion; formStatus.textContent = '搜尋客戶...';
          try {
            const rows = await searchCustomers(client, customerSearch.value);
            if (!alive() || version !== customerVersion) return; customers = rows; renderCustomers(rows);
            formStatus.textContent = rows.length >= 20 ? '顯示前 20 位客戶，請輸入更多名稱' : '';
          } catch (error) { if (alive() && version === customerVersion) formStatus.textContent = `客戶搜尋失敗：${error.message}`; }
        }, 250);
      });
      customerSelect.addEventListener('change', () => {
        allocations.clear(); renderBanks(customers.find(row => row.id === customerSelect.value)); updateTotal(); loadInvoices();
      });
      form.querySelector('[data-find]').onclick = loadInvoices;
      form.querySelector('[data-cancel]').onclick = () => {
        if (!saving) { clearTimeout(customerTimer); editor.replaceChildren(); editing = false; }
      };
      form.onsubmit = async event => {
        event.preventDefault(); if (saving || !alive()) return;
        const customer = customers.find(row => row.id === customerSelect.value);
        const bank = banks.find(row => row.id === bankSelect.value);
        const selected = [...allocations].filter(([, amount]) => Number.isFinite(amount) && amount > 0)
          .map(([invoice_id, amount]) => ({ invoice_id, amount }));
        if (!customer || !bank || bank.currency !== customer.default_currency) { formStatus.textContent = '請選擇客戶及相同幣別的收款銀行'; return; }
        if (!selected.length || selected.length > MAX_ALLOCATIONS) { formStatus.textContent = '請填寫 1 至 200 張發票的沖銷金額'; return; }
        const total = roundMoney(selected.reduce((sum, item) => sum + item.amount, 0));
        if (selected.some(item => item.amount <= 0) || total <= 0) { formStatus.textContent = '沖銷金額必須大於 0'; return; }
        const payload = { customer_id: customer.id, bank_account_id: bank.id,
          receipt_date: form.elements.receipt_date.value, amount: total, memo: form.elements.memo.value };
        saving = true; formStatus.textContent = '收款入帳中...';
        form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
        try {
          const { data, error } = await client.rpc('post_ar_receipt', { p_id: id, p_receipt: payload, p_allocations: selected });
          if (error) throw error;
          if (!data || data.id !== id || data.status !== 'posted' || !data.transaction_id || !data.receipt_no) {
            throw new Error('收款結果未確認，請關閉表單後重新查詢');
          }
          if (!alive()) return; editor.textContent = `已入帳 ${data.receipt_no}`; editing = false; await refresh();
        } catch (error) { if (alive()) formStatus.textContent = `收款失敗：${error.message}`; }
        finally {
          saving = false; form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = false; });
        }
      };
      editor.replaceChildren(form); customerSearch.focus();
    } catch (error) { if (alive()) { editor.textContent = `表單載入失敗：${error.message}`; editing = false; } }
  }

  searchForm.onsubmit = event => { event.preventDefault(); search = searchForm.elements.search.value; page = 0; refresh(); };
  previous.onclick = () => { if (page > 0) { page--; refresh(); } };
  next.onclick = () => { page++; refresh(); };
  root.querySelector('[data-new]').onclick = openEditor;
  refresh();
}
