export const STATEMENT_MAX_FILE_BYTES = 3 * 1024 * 1024;

export function validateStatementAccount(bank, profile) {
  if (!bank || !profile || !String(bank.bank_name || '').includes(profile.bank) ||
      !String(bank.account_number || '').replace(/[\s-]/g, '').endsWith(profile.account_suffix)) {
    throw new Error('解析規則與所選銀行帳戶不一致，請重新選擇。');
  }
}

export async function statementApi(client, { payload, fetchImpl = fetch } = {}) {
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('請重新登入後解析對帳單。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetchImpl('/api/parse_statement', {
      method: payload ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      cache: 'no-store', signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(response.status === 413 ? 'PDF 不可超過 3 MB。' : result?.message || '解析服務暫時無法使用。');
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('解析逾時，請拆分 PDF 後再試。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function selectedStatementRows(records, preview) {
  return [...preview.querySelectorAll('input[data-statement-index]:checked')]
    .map(input => records[Number(input.dataset.statementIndex)]);
}
