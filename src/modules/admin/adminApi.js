import { supabase } from '../../../scripts/supabaseClient.js';

export async function fetchAllUsers() {
  const { data, error } = await supabase.from('profiles').select('*, department:departments(name)').order('created_at');
  if (error) throw error;
  return data;
}

export async function updateUserProfile(id, updates) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}

export async function toggleUserActive(id, active) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function updateUserPermissions(id, permissions) {
  const { error } = await supabase.from('profiles').update({ permissions }).eq('id', id);
  if (error) throw error;
}

export async function inviteNewUser(payload) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) throw new Error('尚未登入或登入狀態已過期，請重新登入。');

  // 💡 確保傳給後端的 key 絕對正確，並且處理空字串轉 null
  const safePayload = {
    email: payload.email,
    fullName: payload.fullName || payload.name, // 容錯處理，確保有 fullName
    role: payload.role || 'employee',
    departmentId: payload.departmentId ? payload.departmentId : null, // 避免空字串造成資料庫關聯錯誤
    password: payload.password,
    permissions: payload.permissions || {},
    employeeId: payload.employeeId || null
  };

  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionData.session.access_token}`
    },
    body: JSON.stringify(safePayload)
  });

  const result = await res.json();
  if (!res.ok || !result.ok) {
    throw new Error(result.message || `開通失敗（HTTP ${res.status}）`);
  }
  return result;
}

// 預設權限配置（依角色給予預設權限）
export const DEFAULT_PERMISSIONS = {
  admin: {
    canViewFinancials: true,
    canViewJournalLedger: true,
    canViewVouchers: true,
    canViewBankAccounts: true,
    canReconcileBank: true,
    canApproveBills: true,
    canManageProjects: true,
    canManageUsers: true,
    canViewReports: true,
    canManageSettings: true
  },
  accounting: {
    canViewFinancials: true,
    canViewJournalLedger: true,
    canViewVouchers: true,
    canViewBankAccounts: true,
    canReconcileBank: true,
    canApproveBills: true,
    canManageProjects: true,
    canManageUsers: false,
    canViewReports: true,
    canManageSettings: false
  },
  manager: {
    canViewFinancials: false,
    canViewJournalLedger: false,
    canViewVouchers: true,
    canViewBankAccounts: false,
    canReconcileBank: false,
    canApproveBills: true,
    canManageProjects: true,
    canManageUsers: false,
    canViewReports: false,
    canManageSettings: false
  },
  employee: {
    canViewFinancials: false,
    canViewJournalLedger: false,
    canViewVouchers: false,
    canViewBankAccounts: false,
    canReconcileBank: false,
    canApproveBills: false,
    canManageProjects: false,
    canManageUsers: false,
    canViewReports: false,
    canManageSettings: false
  }
};

export function getDefaultPermissions(role) {
  return DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.employee;
}

// 取得所有部門
export async function fetchDepartments() {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  if (error) throw error;
  return data;
}

// 建立部門
export async function createDepartment(data) {
  const { data: result, error } = await supabase.from('departments').insert(data).select().single();
  if (error) throw error;
  return result;
}

// 更新部門
export async function updateDepartment(id, updates) {
  const { error } = await supabase.from('departments').update(updates).eq('id', id);
  if (error) throw error;
}

// 刪除部門
export async function deleteDepartment(id) {
  const { error } = await supabase.from('departments').delete().eq('id', id);
  if (error) throw error;
}

// 取得專案列表
export async function fetchProjects(filters = {}) {
  let query = supabase.from('projects').select('*').order('project_code');
  if (filters.department_id) query = query.eq('department_id', filters.department_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.manager_id) query = query.eq('manager_id', filters.manager_id);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// 建立專案
export async function createProject(data) {
  const { data: result, error } = await supabase.from('projects').insert(data).select().single();
  if (error) throw error;
  return result;
}

// 更新專案
export async function updateProject(id, updates) {
  const { error } = await supabase.from('projects').update(updates).eq('id', id);
  if (error) throw error;
}

// 更新專案成員（採用差異比對，而非整批刪除重建，確保稽核紀錄只反映「真正的異動」）
export async function updateProjectMembers(projectId, members, actorId = null) {
  const { data: existing, error: fetchError } = await supabase
    .from('project_members').select('id, user_id, role').eq('project_id', projectId);
  if (fetchError) throw fetchError;

  const existingByUserId = new Map((existing || []).map(m => [m.user_id, m]));
  const nextUserIds = new Set((members || []).map(m => m.user_id));

  // 刪除：原本有、但新名單裡沒有的成員
  const toRemove = (existing || []).filter(m => !nextUserIds.has(m.user_id));
  if (toRemove.length > 0) {
    const { error: delError } = await supabase
      .from('project_members').delete().in('id', toRemove.map(m => m.id));
    if (delError) throw delError;
  }

  // 新增：新名單裡有、但原本沒有的成員
  const toAdd = (members || []).filter(m => !existingByUserId.has(m.user_id));
  if (toAdd.length > 0) {
    const { error: insError } = await supabase.from('project_members').insert(
      toAdd.map(m => ({ project_id: projectId, user_id: m.user_id, role: m.role || 'member', added_by: actorId }))
    );
    if (insError) throw insError;
  }

  // 角色變更：使用者仍在名單內，但擔任角色不同（例如 member 改 owner）
  for (const m of (members || [])) {
    const prev = existingByUserId.get(m.user_id);
    if (prev && prev.role !== (m.role || 'member')) {
      const { error: updError } = await supabase
        .from('project_members').update({ role: m.role || 'member' }).eq('id', prev.id);
      if (updError) throw updError;
    }
  }

  const refreshedMembers = await fetchProjectMembers(projectId);
  return { success: true, added: toAdd.length, removed: toRemove.length, members: refreshedMembers };
}

// 取得專案成員
export async function fetchProjectMembers(projectId) {
  const { data: members, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId);
  if (error) throw error;

  const userIds = [...new Set((members || []).map(member => member.user_id).filter(Boolean))];
  if (userIds.length === 0) return members || [];

  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, department_id')
    .in('id', userIds);
  if (usersError) throw usersError;

  const userById = new Map((users || []).map(user => [user.id, user]));
  return (members || []).map(member => ({
    ...member,
    user: userById.get(member.user_id) || null
  }));
}

// 取得專案預算異動記錄
export async function fetchProjectBudgetLogs(projectId) {
  const { data, error } = await supabase
    .from('project_budget_logs')
    .select('*, operator:profiles(full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// 更新專案預算（含異動記錄）
export async function updateProjectBudget(projectId, oldBudget, newBudget, reason, operatorId) {
  const { error } = await supabase.from('project_budget_logs').insert({
    project_id: projectId,
    old_budget: oldBudget,
    new_budget: newBudget,
    change_reason: reason,
    operator_id: operatorId
  });
  if (error) throw error;
  
  // 更新專案總預算
  const { error: updError } = await supabase.from('projects').update({ total_budget: newBudget }).eq('id', projectId);
  if (updError) throw updError;
}
