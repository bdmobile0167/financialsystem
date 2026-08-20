import { supabase } from '../../../scripts/supabaseClient.js';

export async function fetchAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, department:departments(name)')
    .order('created_at');
  if (error) throw error;
  return data || [];
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
  if (!sessionData?.session?.access_token) {
    throw new Error('Missing signed-in session. Please sign in again before inviting a user.');
  }

  const safePayload = {
    email: payload.email,
    fullName: payload.fullName || payload.name,
    role: payload.role || 'employee',
    departmentId: payload.departmentId || null,
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

  let result = null;
  try {
    result = await res.json();
  } catch {
    result = { message: `Invite API returned HTTP ${res.status}.` };
  }

  if (!res.ok || !result.ok) {
    throw new Error(result.message || `Invite failed with HTTP ${res.status}.`);
  }
  return result;
}

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

export async function fetchDepartments() {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function createDepartment(data) {
  const { data: result, error } = await supabase.from('departments').insert(data).select().single();
  if (error) throw error;
  return result;
}

export async function updateDepartment(id, updates) {
  const { error } = await supabase.from('departments').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteDepartment(id) {
  const { error } = await supabase.from('departments').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchProjects(filters = {}) {
  let query = supabase.from('projects').select('*').order('project_code');
  if (filters.department_id) query = query.eq('department_id', filters.department_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.manager_id) query = query.eq('manager_id', filters.manager_id);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createProject(data) {
  const { data: result, error } = await supabase.from('projects').insert(data).select().single();
  if (error) throw error;
  return result;
}

export async function updateProject(id, updates) {
  const { error } = await supabase.from('projects').update(updates).eq('id', id);
  if (error) throw error;
}

export async function updateProjectMembers(projectId, members, actorId = null) {
  const { data: existing, error: fetchError } = await supabase
    .from('project_members')
    .select('id, user_id, role')
    .eq('project_id', projectId);
  if (fetchError) throw fetchError;

  const normalizedMembers = (members || [])
    .filter(member => member.user_id)
    .map(member => ({ ...member, role: member.role === 'owner' ? 'owner' : 'member' }));

  const existingByUserId = new Map((existing || []).map(member => [member.user_id, member]));
  const nextUserIds = new Set(normalizedMembers.map(member => member.user_id));

  const toRemove = (existing || []).filter(member => !nextUserIds.has(member.user_id));
  if (toRemove.length > 0) {
    const { error: delError } = await supabase
      .from('project_members')
      .delete()
      .in('id', toRemove.map(member => member.id));
    if (delError) throw delError;
  }

  const toAdd = normalizedMembers.filter(member => !existingByUserId.has(member.user_id));
  if (toAdd.length > 0) {
    const { error: insError } = await supabase.from('project_members').upsert(
      toAdd.map(member => ({
        project_id: projectId,
        user_id: member.user_id,
        role: member.role,
        added_by: actorId
      })),
      { onConflict: 'project_id,user_id', ignoreDuplicates: true }
    );
    if (insError) throw insError;
  }

  for (const member of normalizedMembers) {
    const prev = existingByUserId.get(member.user_id);
    if (prev && prev.role !== member.role) {
      const { error: updError } = await supabase
        .from('project_members')
        .update({ role: member.role })
        .eq('id', prev.id);
      if (updError) throw updError;
    }
  }

  return { success: true, added: toAdd.length, removed: toRemove.length };
}

export async function fetchProjectMembers(projectId) {
  const { data: members, error } = await supabase
    .from('project_members')
    .select('id, project_id, user_id, role, added_by, created_at')
    .eq('project_id', projectId);
  if (error) throw error;

  const userIds = [...new Set((members || []).map(member => member.user_id).filter(Boolean))];
  if (userIds.length === 0) return members || [];

  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('id', userIds);
  if (usersError) throw usersError;

  const userById = new Map((users || []).map(user => [user.id, user]));
  return (members || []).map(member => ({
    ...member,
    user: userById.get(member.user_id) || null
  }));
}

export async function fetchProjectBudgetLogs(projectId) {
  const { data, error } = await supabase
    .from('project_budget_logs')
    .select('*, operator:profiles(full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateProjectBudget(projectId, oldBudget, newBudget, reason, operatorId) {
  const { error } = await supabase.from('project_budget_logs').insert({
    project_id: projectId,
    old_budget: oldBudget,
    new_budget: newBudget,
    change_reason: reason,
    operator_id: operatorId
  });
  if (error) throw error;

  const { error: updError } = await supabase
    .from('projects')
    .update({ total_budget: newBudget })
    .eq('id', projectId);
  if (updError) throw updError;
}
