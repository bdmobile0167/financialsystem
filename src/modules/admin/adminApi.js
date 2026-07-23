import { supabase } from '../../../scripts/supabaseClient.js';

export async function fetchAllUsers() {
  const { data, error } = await supabase.from('profiles').select('*, department:departments(name)').order('created_at');
  if (error) throw error;
  return data;
}

export async function updateUserProfile(id, { role, departmentId, fullName }) {
  const { error } = await supabase.from('profiles').update({
    role, department_id: departmentId, full_name: fullName
  }).eq('id', id);
  if (error) throw error;
}

export async function toggleUserActive(id, active) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function inviteNewUser(payload) {
  const { data: sessionData } = await supabase.auth.getSession();

  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionData.session.access_token}`
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json();
  if (!res.ok || !result.ok) {
    throw new Error(result.message || `開通失敗（HTTP ${res.status}）`);
  }
  return result;
}
