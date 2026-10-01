// Retired endpoint for cached clients. Uploads are never parsed here.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(410).json({ ok: false, code: 'parser_retired', message: '請重新整理頁面後使用新版銀行解析服務。' });
};
