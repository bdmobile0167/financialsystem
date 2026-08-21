export async function getCompanyInfo() {
  return {};
}

export async function getMyCompanies() {
  return [];
}

export async function getCurrentMembership() {
  return null;
}

export async function validateCompanyAccess() {
  return true;
}

export async function getActiveCompany() {
  return { id: null, name: '當前公司' };
}

const ROLE_PERMISSIONS = {
  super_admin: ['user.invite', 'report.view', 'report.export'],
  admin: ['report.view', 'report.export'],
  accounting: ['report.view', 'report.export'],
  manager: ['report.view'],
  employee: []
};

export function getCurrentPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export async function getStructureSettings() {
  return [];
}

export function getActiveCompanyId() {
  return null;
}

export function setActiveCompanyId() {
  return null;
}

export function clearCompanyCache() {
  return null;
}
