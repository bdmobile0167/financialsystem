const crypto = require('crypto');

function derivePasswordHash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
}

function timingSafeEqual(a, b) {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: '只允許 POST 請求。' });
    return;
  }

  try {
    const { username = '', password = '' } = req.body || {};
    const adminUsername = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
    const storedHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
    const storedSalt = (process.env.ADMIN_PASSWORD_SALT || '').trim();

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = String(password);

    if (!adminUsername || !storedHash || !storedSalt) {
      res.status(500).json({ ok: false, message: '後端尚未正確設定管理者帳號或密碼雜湊值，請檢查 Vercel 環境變數。' });
      return;
    }

    const isAdminUser = normalizedUsername === adminUsername;
    const isPasswordValid = Boolean(isAdminUser && timingSafeEqual(derivePasswordHash(normalizedPassword, storedSalt), storedHash));

    if (isPasswordValid) {
      res.status(200).json({ ok: true, user: { username: normalizedUsername, name: '管理者', role: 'admin' } });
      return;
    }

    console.log({
      loginUser: normalizedUsername,
      envUser: adminUsername
    });

  }catch(error){

    console.error(error);

    res.status(500).json({
        ok:false,
        message:error.message
    });

  }
};