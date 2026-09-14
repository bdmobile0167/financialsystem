const PAGE_SIZE = 50;

const BUCKET_LABELS = {
  current: '未到期',
  '1-30': '逾期 1-30 天',
  '31-60': '逾期 31-60 天',
  '61-90': '逾期 61-90 天',
  '91+': '逾期 91 天以上'
};

function formatAmount(value, currency) {
  return `${currency} ${Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}

function localDateValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addOption(select, text, value) {
  select.add(new Option(text, value));
}

export async function fetchArAgingPage(client, filters = {}) {
  const page = filters.page ?? 0;
  if (!Number.isInteger(page) || page < 0) throw new Error('無效頁碼');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.asOfDate || '')) throw new Error('帳齡截至日無效');
  const { data, error } = await client.rpc('get_ar_aging', {
    p_as_of_date: filters.asOfDate,
    p_customer_id: filters.customerId || null,
    p_department_id: filters.departmentId || null,
    p_project_id: filters.projectId || null,
    p_bucket: filters.bucket || null,
    p_search: (filters.search || '').trim() || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE
  });
  if (error) throw error;
  if (!data || !Number.isInteger(data.total_count) || data.total_count < 0 ||
      !Array.isArray(data.rows) || !Array.isArray(data.totals_by_currency)) {
    throw new Error('帳齡查詢未回傳完整結果');
  }
  const expected = Math.min(PAGE_SIZE, Math.max(0, data.total_count - page * PAGE_SIZE));
  if (data.rows.length !== expected) throw new Error('帳齡清單不完整，請重新載入');
  return data;
}

export function mountArAgingReport(root, {
  client,
  canManage,
  getDepartments = async () => [],
  getProjects = async () => []
}) {
  if (!root || !canManage()) return;
  root.innerHTML = `<h2>應收帳齡</h2>
    <form data-filters class="ar-aging-filters">
      <label for="ar-aging-date">截至日<input id="ar-aging-date" name="as_of_date" type="date" required></label>
      <label for="ar-aging-search">客戶／發票<input id="ar-aging-search" name="search" type="search" maxlength="80" placeholder="客戶名稱、編號或發票號碼"></label>
      <label for="ar-aging-department">部門<select id="ar-aging-department" name="department_id"><option value="">全部部門</option></select></label>
      <label for="ar-aging-project">專案<select id="ar-aging-project" name="project_id"><option value="">全部專案</option></select></label>
      <label for="ar-aging-bucket">帳齡區間<select id="ar-aging-bucket" name="bucket"><option value="">全部區間</option><option value="current">未到期</option><option value="1-30">1-30 天</option><option value="31-60">31-60 天</option><option value="61-90">61-90 天</option><option value="91+">91 天以上</option></select></label>
      <div class="ar-aging-actions"><button type="submit">查詢</button><button type="button" data-reset>清除條件</button></div>
    </form>
    <p data-status role="status"></p>
    <div data-summary class="ar-aging-summary" aria-label="帳齡彙總"></div>
    <div class="table-wrapper"><table><thead><tr><th>發票</th><th>客戶</th><th>開立／到期</th><th>部門／專案</th><th>原始金額</th><th>截至已收</th><th>未收金額</th><th>帳齡</th></tr></thead><tbody></tbody></table></div>
    <div class="ar-toolbar"><button type="button" data-prev aria-label="上一頁">上一頁</button><span data-page></span><button type="button" data-next aria-label="下一頁">下一頁</button></div>`;

  const form = root.querySelector('[data-filters]');
  const status = root.querySelector('[data-status]');
  const summary = root.querySelector('[data-summary]');
  const body = root.querySelector('tbody');
  const previous = root.querySelector('[data-prev]');
  const next = root.querySelector('[data-next]');
  const pageText = root.querySelector('[data-page]');
  let page = 0;
  let generation = 0;
  let loading = false;
  const alive = () => root.isConnected && root.querySelector('[data-filters]') === form && canManage();
  form.elements.as_of_date.value = localDateValue();

  function currentFilters() {
    return {
      asOfDate: form.elements.as_of_date.value,
      search: form.elements.search.value,
      departmentId: form.elements.department_id.value,
      projectId: form.elements.project_id.value,
      bucket: form.elements.bucket.value,
      page
    };
  }

  function renderSummary(totals) {
    summary.replaceChildren();
    totals.forEach(total => {
      const item = document.createElement('article');
      item.className = 'ar-aging-total';
      const heading = document.createElement('h3');
      heading.textContent = `${total.currency}｜${total.invoice_count} 張`;
      const values = document.createElement('dl');
      const pairs = [
        ['未收合計', total.outstanding_amount],
        ['未到期', total.current_amount],
        ['1-30 天', total.amount_1_30],
        ['31-60 天', total.amount_31_60],
        ['61-90 天', total.amount_61_90],
        ['91 天以上', total.amount_91_plus]
      ];
      pairs.forEach(([label, value]) => {
        const term = document.createElement('dt'); term.textContent = label;
        const amount = document.createElement('dd'); amount.textContent = formatAmount(value, total.currency);
        values.append(term, amount);
      });
      item.append(heading, values); summary.append(item);
    });
  }

  function renderRows(rows) {
    body.replaceChildren();
    rows.forEach(invoice => {
      const row = document.createElement('tr');
      const values = [
        `${invoice.invoice_no || ''}${invoice.tax_invoice_no ? `\n${invoice.tax_invoice_no}` : ''}`,
        `${invoice.customer_no || ''}\n${invoice.customer_name || ''}`,
        `${invoice.issue_date}\n${invoice.due_date}`,
        `${invoice.department_name || '未指定'}\n${invoice.project_code ? `${invoice.project_code} ` : ''}${invoice.project_name || '未指定'}`,
        formatAmount(invoice.total_amount, invoice.currency),
        formatAmount(invoice.paid_amount_as_of, invoice.currency),
        formatAmount(invoice.outstanding_amount, invoice.currency),
        `${BUCKET_LABELS[invoice.aging_bucket] || invoice.aging_bucket}\n${invoice.days_overdue ? `${invoice.days_overdue} 天` : ''}`
      ];
      values.forEach(value => {
        const cell = document.createElement('td');
        String(value).split('\n').forEach((part, index) => {
          if (index) cell.append(document.createElement('br'));
          cell.append(document.createTextNode(part));
        });
        row.append(cell);
      });
      body.append(row);
    });
  }

  async function refresh() {
    if (loading || !alive()) return;
    const version = ++generation;
    loading = true;
    previous.disabled = next.disabled = true;
    status.textContent = '載入應收帳齡...';
    try {
      const result = await fetchArAgingPage(client, currentFilters());
      if (!alive() || version !== generation) return;
      if (page > 0 && !result.rows.length) { page = 0; loading = false; return refresh(); }
      renderSummary(result.totals_by_currency);
      renderRows(result.rows);
      status.textContent = result.total_count ? `截至 ${result.as_of_date}，共 ${result.total_count} 張未收發票` : `截至 ${result.as_of_date}，沒有符合條件的未收發票`;
      pageText.textContent = `${page + 1} / ${Math.max(1, Math.ceil(result.total_count / PAGE_SIZE))}`;
      previous.disabled = page === 0;
      next.disabled = (page + 1) * PAGE_SIZE >= result.total_count;
    } catch (error) {
      if (alive() && version === generation) {
        body.replaceChildren(); summary.replaceChildren(); pageText.textContent = '';
        status.textContent = `帳齡載入失敗：${error.message}`;
      }
    } finally {
      loading = false;
    }
  }

  async function initialize() {
    status.textContent = '載入篩選條件...';
    try {
      const [departments, projects] = await Promise.all([getDepartments(), getProjects()]);
      if (!alive()) return;
      (departments || []).forEach(department => addOption(form.elements.department_id, department.name, department.id));
      (projects || []).forEach(project => addOption(form.elements.project_id,
        `${project.project_code ? `${project.project_code} ` : ''}${project.name}`, project.id));
      await refresh();
    } catch (error) {
      if (alive()) status.textContent = `篩選條件載入失敗：${error.message}`;
    }
  }

  form.onsubmit = event => { event.preventDefault(); page = 0; refresh(); };
  form.querySelector('[data-reset]').onclick = () => {
    form.reset(); form.elements.as_of_date.value = localDateValue(); page = 0; refresh();
  };
  previous.onclick = () => { if (page > 0 && !loading) { page--; refresh(); } };
  next.onclick = () => { if (!loading) { page++; refresh(); } };
  initialize();
}
