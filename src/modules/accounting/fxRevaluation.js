const FINANCE_ROLES = new Set(['admin', 'super_admin', 'accounting']);

function localDateValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function defaultFxRevaluationDate(now = new Date()) {
  return localDateValue(new Date(now.getFullYear(), now.getMonth(), 0));
}

export function formatFxBase(value) {
  return `TWD ${Number(value || 0).toLocaleString('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatOriginal(value, currency) {
  return `${currency || '-'} ${Number(value || 0).toLocaleString('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function setStatus(root, message, isError = false) {
  const status = root.querySelector('[data-fx-status]');
  if (!status) return;
  status.textContent = message || '';
  status.className = isError ? 'message error' : 'muted';
}

function appendCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
}

function renderPreview(root, result) {
  const output = root.querySelector('[data-fx-preview]');
  const postButton = root.querySelector('[data-fx-post]');
  if (!output || !postButton) return;
  output.replaceChildren();

  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  const totals = result?.totals || {};
  const persisted = result?.persisted === true;

  const summary = document.createElement('div');
  summary.className = 'fx-revaluation-summary';
  [
    ['需調整項目', Number(totals.line_count || 0).toLocaleString('zh-TW')],
    ['未實現利益', formatFxBase(totals.gain_base)],
    ['未實現損失', formatFxBase(totals.loss_base)],
    ['淨影響', formatFxBase(totals.net_base)]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    const term = document.createElement('span');
    const amount = document.createElement('strong');
    term.textContent = label;
    amount.textContent = value;
    item.append(term, amount);
    summary.append(item);
  });
  output.append(summary);

  if (issues.length) {
    const list = document.createElement('ul');
    list.className = 'fx-revaluation-issues';
    issues.forEach(issue => {
      const item = document.createElement('li');
      item.textContent = `${issue.source_label || '未命名項目'}：${issue.message || '資料不完整'}`;
      list.append(item);
    });
    output.append(list);
  }

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '指定日期沒有需要重估的外幣銀行或應收餘額。';
    output.append(empty);
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper fx-revaluation-table';
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['來源', '幣別餘額', '帳載 TWD', '期末匯率', '重估後 TWD', '調整'].forEach(label => {
      const cell = document.createElement('th');
      cell.textContent = label;
      headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement('tbody');
    rows.forEach(item => {
      const row = document.createElement('tr');
      const sourceLabel = item.source_type === 'bank_account' ? '銀行' : '應收';
      appendCell(row, `${sourceLabel} / ${item.source_label || '-'}`);
      appendCell(row, formatOriginal(item.foreign_balance, item.currency), 'numeric');
      appendCell(row, formatFxBase(item.carrying_amount_base), 'numeric');
      appendCell(row, item.closing_exchange_rate == null ? '-' : Number(item.closing_exchange_rate).toLocaleString('zh-TW', { maximumFractionDigits: 6 }), 'numeric');
      appendCell(row, item.revalued_amount_base == null ? '-' : formatFxBase(item.revalued_amount_base), 'numeric');
      const adjustment = Number(item.adjustment_amount_base || 0);
      appendCell(row, `${adjustment >= 0 ? '利益' : '損失'} ${formatFxBase(Math.abs(adjustment))}`, `numeric ${adjustment >= 0 ? 'fx-gain' : 'fx-loss'}`);
      body.append(row);
    });
    table.append(head, body);
    wrapper.append(table);
    output.append(wrapper);
  }

  const reversal = document.createElement('p');
  reversal.className = 'muted';
  reversal.textContent = `過帳後會在 ${result?.run?.reversal_date || result?.reversal_date || '-'} 自動建立反轉分錄。`;
  output.append(reversal);

  postButton.disabled = persisted || issues.length > 0 || Number(totals.line_count || 0) === 0;
  postButton.textContent = persisted ? '該日期已過帳' : '確認過帳';
}

async function fetchRuns(client) {
  const { data, error } = await client
    .from('fx_revaluation_runs')
    .select('id,as_of_date,reversal_date,status,line_count,total_gain_base,total_loss_base,posted_at,void_reason,voided_at,revision')
    .order('as_of_date', { ascending: false })
    .order('posted_at', { ascending: false })
    .limit(24);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function renderRuns(root, runs, onVoid) {
  const output = root.querySelector('[data-fx-runs]');
  if (!output) return;
  output.replaceChildren();
  if (!runs.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '尚無期末外幣重估紀錄。';
    output.append(empty);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper fx-revaluation-runs';
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>期末日</th><th>反轉日</th><th>項目</th><th>利益</th><th>損失</th><th>狀態</th><th>操作</th></tr></thead>';
  const body = document.createElement('tbody');
  const latestPosted = runs.find(run => run.status === 'posted')?.id;
  runs.forEach(run => {
    const row = document.createElement('tr');
    appendCell(row, run.as_of_date || '-');
    appendCell(row, run.reversal_date || '-');
    appendCell(row, Number(run.line_count || 0).toLocaleString('zh-TW'), 'numeric');
    appendCell(row, formatFxBase(run.total_gain_base), 'numeric');
    appendCell(row, formatFxBase(run.total_loss_base), 'numeric');
    appendCell(row, run.status === 'posted' ? '已過帳' : '已作廢');
    const action = document.createElement('td');
    if (run.status === 'posted' && run.id === latestPosted) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'danger';
      button.textContent = '作廢';
      button.addEventListener('click', () => onVoid(run, button));
      action.append(button);
    } else {
      action.textContent = run.status === 'voided' ? (run.void_reason || '-') : '須先作廢較新批次';
      action.className = 'muted';
    }
    row.append(action);
    body.append(row);
  });
  table.append(body);
  wrapper.append(table);
  output.append(wrapper);
}

export function mountFxRevaluation(root, {
  client,
  currentRole,
  showMessage = () => {},
  confirmAction = message => window.confirm(message),
  promptAction = message => window.prompt(message)
}) {
  const role = typeof currentRole === 'function' ? currentRole() : currentRole;
  const allowed = FINANCE_ROLES.has(role);
  if (!root) return null;
  root.hidden = !allowed;
  if (!allowed) return null;

  const dateInput = root.querySelector('[data-fx-date]');
  const previewButton = root.querySelector('[data-fx-preview-button]');
  const postButton = root.querySelector('[data-fx-post]');
  const refreshButton = root.querySelector('[data-fx-refresh]');
  if (!dateInput || !previewButton || !postButton || !refreshButton) return null;
  dateInput.max = localDateValue();
  if (!dateInput.value) dateInput.value = defaultFxRevaluationDate();

  let previewResult = null;
  let busy = false;
  const setBusy = value => {
    busy = value;
    dateInput.disabled = value;
    previewButton.disabled = value;
    refreshButton.disabled = value;
    postButton.disabled = value || !previewResult || previewResult.persisted === true
      || (previewResult.issues || []).length > 0
      || Number(previewResult?.totals?.line_count || 0) === 0;
  };

  const refreshRuns = async () => {
    const runs = await fetchRuns(client);
    renderRuns(root, runs, async (run, button) => {
      if (busy) return;
      const reason = promptAction(`請輸入作廢 ${run.as_of_date} 重估批次的原因：`);
      if (reason === null) return;
      if (reason.trim().length < 2) {
        showMessage('作廢原因至少需要 2 個字。', true);
        return;
      }
      if (!confirmAction(`確定作廢 ${run.as_of_date} 的外幣重估？原分錄與隔日反轉會留下沖銷紀錄。`)) return;
      setBusy(true);
      button.textContent = '作廢中...';
      try {
        const { error } = await client.rpc('void_fx_revaluation', { p_run_id: run.id, p_reason: reason.trim() });
        if (error) throw error;
        previewResult = null;
        root.querySelector('[data-fx-preview]').replaceChildren();
        showMessage('外幣重估已作廢，原始紀錄與沖銷分錄均已保留。');
        await refreshRuns();
      } catch (error) {
        setStatus(root, `作廢失敗：${error.message}`, true);
      } finally {
        setBusy(false);
      }
    });
  };

  const preview = async () => {
    if (busy || !dateInput.value) return;
    setBusy(true);
    setStatus(root, '正在計算期末外幣餘額...');
    try {
      const { data, error } = await client.rpc('preview_fx_revaluation', { p_as_of_date: dateInput.value });
      if (error) throw error;
      previewResult = data;
      renderPreview(root, data);
      setStatus(root, data?.persisted ? '該日期已有正式重估批次。' : '預覽完成；確認內容後才會正式過帳。');
    } catch (error) {
      previewResult = null;
      root.querySelector('[data-fx-preview]').replaceChildren();
      setStatus(root, `預覽失敗：${error.message}`, true);
    } finally {
      setBusy(false);
      if (previewResult) renderPreview(root, previewResult);
    }
  };

  previewButton.onclick = preview;
  refreshButton.onclick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await refreshRuns();
      setStatus(root, '重估紀錄已更新。');
    } catch (error) {
      setStatus(root, `讀取失敗：${error.message}`, true);
    } finally {
      setBusy(false);
    }
  };
  postButton.onclick = async () => {
    if (busy || !previewResult || previewResult.persisted || (previewResult.issues || []).length) return;
    if (!confirmAction(`確定過帳 ${dateInput.value} 的期末外幣重估？系統會同時建立次日自動反轉分錄。`)) return;
    setBusy(true);
    setStatus(root, '正在過帳並建立隔日反轉...');
    try {
      const { data, error } = await client.rpc('post_fx_revaluation', { p_as_of_date: dateInput.value });
      if (error) throw error;
      previewResult = data;
      renderPreview(root, data);
      await refreshRuns();
      showMessage(data?.idempotent ? '該日期已過帳，未重複建立分錄。' : '期末外幣重估與隔日反轉已過帳。');
      setStatus(root, '過帳完成。');
    } catch (error) {
      setStatus(root, `過帳失敗：${error.message}`, true);
    } finally {
      setBusy(false);
      if (previewResult) renderPreview(root, previewResult);
    }
  };

  refreshRuns().catch(error => setStatus(root, `讀取失敗：${error.message}`, true));
  return { preview, refreshRuns };
}
