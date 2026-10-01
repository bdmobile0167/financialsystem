import { supabase } from './supabaseClient.js';

let notificationRealtimeChannel = null;

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

export async function subscribeMyNotifications(onChange) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || typeof supabase.channel !== 'function') return () => {};

  if (notificationRealtimeChannel) {
    await supabase.removeChannel(notificationRealtimeChannel);
    notificationRealtimeChannel = null;
  }

  notificationRealtimeChannel = supabase
    .channel(`notifications:${user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
      payload => {
        if (typeof onChange === 'function') onChange(payload);
      }
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Notification realtime subscription status:', status);
      }
    });

  return async () => {
    if (notificationRealtimeChannel) {
      await supabase.removeChannel(notificationRealtimeChannel);
      notificationRealtimeChannel = null;
    }
  };
}

export async function markAllNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  if (error) console.error('全部標記已讀失敗:', error);
}
