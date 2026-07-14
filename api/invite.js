const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DEFAULT_PASSWORD = 'Bd@1234';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: '只允許 POST 請求。' });
    return;
  }

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ ok: false, message: '未登入。' });
      return;
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      res.status(401).json({ ok: false, message: '登入狀態已失效，請重新登入。' });
      return;
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      res.status(403).json({ ok: false, message: '只有管理員可以新增使用者。' });
      return;
    }

    const { email, fullName, role = 'employee', department = '' } = req.body || {};
    if (!email || !fullName) {
      res.status(400).json({ ok: false, message: '請提供 email 與姓名。' });
      return;
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true
    });

    if (createError) {
      res.status(400).json({ ok: false, message: `建立帳號失敗：${createError.message}` });
      return;
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: createdUser.user.id,
      email,
      full_name: fullName,
      role,
      department,
      must_change_password: true
    });

    if (profileError) {
      res.status(400).json({ ok: false, message: `寫入使用者資料失敗：${profileError.message}` });
      return;
    }

    res.status(200).json({
      ok: true,
      message: `已建立帳號：${email}`,
      credentials: { email, tempPassword: DEFAULT_PASSWORD }
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: `伺服器發生錯誤：${error.message}` });
  }
};