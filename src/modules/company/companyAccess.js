const COMPANY_ROLES = new Set(['super_admin', 'admin', 'accounting', 'manager', 'employee']);
const SCOPE_STATES = new Set(['legacy_unscoped', 'provisioning', 'ready']);

function verifyMembership(row, companyId) {
  if (!row || typeof companyId !== 'string' || !companyId.trim() || row.company_id !== companyId || !COMPANY_ROLES.has(row.role) || !SCOPE_STATES.has(row.scope_status)) {
    throw new Error('公司會員回應不完整，請重新登入後再試。');
  }
  return row;
}

export async function listAccessibleCompanies(client) {
  const { data, error } = await client.rpc('get_my_companies');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('公司清單載入失敗。');
  return data.map(row => ({ ...verifyMembership(row, row?.company_id) }));
}

export async function readCompanyMembership(client, companyId) {
  if (!companyId) return null;
  const { data, error } = await client.rpc('get_my_company_membership', { p_company_id: companyId });
  if (error) throw error;
  if (data == null) return null;
  return { ...verifyMembership(data, companyId) };
}

export async function canAccessCompany(client, companyId) {
  return (await readCompanyMembership(client, companyId)) !== null;
}
