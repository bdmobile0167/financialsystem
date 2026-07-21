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

  return res.json();
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