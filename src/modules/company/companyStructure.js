function normalizeBusinessItems(items) {
  const rows = items.map(item => ({ code: String(item.code || '').trim().toUpperCase(), item: String(item.item || '').trim() }))
    .filter(row => row.code || row.item);
  if (!rows.length || rows.length > 100) throw new Error('營業項目需為 1 至 100 筆。');
  const seen = new Set();
  for (const row of rows) {
    if (!row.code || !row.item || row.code.length > 50 || row.item.length > 500) throw new Error('營業項目需填寫有效代碼與名稱。');
    if (seen.has(row.code)) throw new Error(`營業項目代碼重複：${row.code}`);
    seen.add(row.code);
  }
  return rows;
}

function normalizeShareholders(shareholders) {
  const rows = shareholders.map(person => ({
    full_name: String(person.name || '').trim(), role_title: String(person.role || '').trim() || null,
    national_id: String(person.idNumber || '').trim() || null, address: String(person.address || '').trim() || null,
    contribution_amount: Number(person.amount || 0)
  })).filter(person => person.full_name || person.role_title || person.national_id || person.address || person.contribution_amount);
  if (!rows.length || rows.length > 100) throw new Error('董監名單需為 1 至 100 筆。');
  for (const row of rows) {
    if (!row.full_name || row.full_name.length > 200) throw new Error('董監名單需填寫有效姓名。');
    if (!Number.isFinite(row.contribution_amount) || row.contribution_amount < 0) throw new Error('董監出資金額必須為非負有限數字。');
  }
  return rows;
}

export async function saveCompanyStructure(client, businessItems, shareholders) {
  const businessRows = normalizeBusinessItems(businessItems);
  const shareholderRows = normalizeShareholders(shareholders);
  const { data, error } = await client.rpc('save_company_structure', { p_business_items: businessRows, p_shareholders: shareholderRows });
  if (error) throw error;
  if (!Array.isArray(data?.business_items) || !Array.isArray(data?.shareholders) ||
      data.business_items.length !== businessRows.length || data.shareholders.length !== shareholderRows.length) {
    throw new Error('公司名單儲存回應不完整，請重新載入核對。');
  }
  return {
    businessItems: data.business_items.map(row => ({ code: row.code, item: row.item, sortOrder: row.sort_order })),
    shareholders: data.shareholders.map(row => ({ id: row.id, role: row.role_title, name: row.full_name,
      idNumber: row.national_id, amount: Number(row.contribution_amount), address: row.address, sortOrder: row.sort_order })),
    contributionTotal: Number(data.contribution_total)
  };
}
