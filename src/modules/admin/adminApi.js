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

  // 💡 確保傳給後端的 key 絕對正確，並且處理空字串轉 null
  const safePayload = {
    email: payload.email,
    fullName: payload.fullName || payload.name, // 容錯處理，確保有 fullName
    role: payload.role || 'employee',
    departmentId: payload.departmentId ? payload.departmentId : null, // 避免空字串造成資料庫關聯錯誤
    password: payload.password
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