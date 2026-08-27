function json(res, status, body) {
  res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    json(res, 405, { ok: false, message: 'Only GET is allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    json(res, 500, {
      ok: false,
      message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in server environment.'
    });
    return;
  }

  json(res, 200, {
    ok: true,
    supabaseUrl,
    supabaseAnonKey,
    source: 'vercel-env'
  });
};
