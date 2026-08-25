import { supabase } from './supabaseClient.js';

/**
 * 建立一則通知給指定使用者
 * @param {string} userId 收到通知的使用者 id（profiles.id）
 * @param {string} title 標題
 * @param {string} message 內容
 * @param {string|null} voucherId 關聯的憑證 id（可選，點擊可跳轉）
 */
export async function createNotification(userId, title, message, voucherId = null) {
  if (!userId) return; // 沒有收件人就不用寫入
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      voucher_id: voucherId
    });
    if (error) console.error('建立通知失敗:', error);
  } catch (err) {
    console.error('建立通知失敗:', err);
  }
}

/**
 * 建立通知給多個使用者（例如某個角色的所有人）
 */
export async function createNotificationForMany(userIds, title, message, voucherId = null) {
  const rows = (userIds || [])
    .filter(Boolean)
    .map(userId => ({ user_id: userId, title, message, voucher_id: voucherId }));
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('建立通知失敗:', error);
  } catch (err) {
    console.error('建立通知失敗:', err);
  }
}

/**
 * 取得指定角色的所有使用者 id（例如通知所有會計人員）
 */
export async function getUserIdsByRole(role) {
  const { data, error } = await supabase.from('profiles').select('id').eq('role', role).eq('active', true);
  if (error) {
    console.error('取得角色使用者失敗:', error);
    return [];
  }
  return (data || []).map(p => p.id);
}

/**
 * 取得目前登入者的通知列表（最新在前，最多 30 筆）
 */
export async function fetchMyNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.error('讀取通知失敗:', error);
    return [];
  }
  return data || [];
}

/**
 * 取得目前登入者的未讀通知數量
 */
export async function fetchUnreadCount() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
  if (error) {
    console.error('讀取未讀通知數失敗:', error);
    return 0;
  }
  return count || 0;
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  if (error) console.error('標記已讀失敗:', error);
}

export async function markAllNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  if (error) console.error('全部標記已讀失敗:', error);
}
