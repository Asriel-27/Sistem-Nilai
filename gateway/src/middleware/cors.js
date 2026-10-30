// CORS hanya untuk origin UI demo (bawaan localhost:3003). Origin lain tidak mendapat header apa pun.
const allowed = (process.env.DEMO_UI_ORIGIN ||
  'http://localhost:3003,http://127.0.0.1:3003').split(',').map((s) => s.trim());

module.exports = function cors(req, res, next) {
  const origin = req.get('origin');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {           // preflight tidak membawa token, jangan lewat PEP
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Device-ID');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      return res.sendStatus(204);
    }
  }
  next();
};
