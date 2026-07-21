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

export async function inviteNewUser({ email, fullName, role, departmentId, password }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const response = await fetch('/api/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, fullName, role, departmentId, password })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || '開通失敗');
  return result;
}

// 在 adminApi.js 中
async function createNewUser(userData) {
  try {
    // 呼叫你的 Netlify Function，而不是直接用 supabase.auth.signUp
    const response = await fetch('/.netlify/functions/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData) // 確保有傳遞 email, password, role 等資料
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    
    alert('新帳號開通成功！');
    // 重新整理帳號列表
  } catch (error) {
    alert(`開通帳號失敗：${error.message}`);
  }
}