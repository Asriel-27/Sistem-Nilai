// ============================================================
// Verifikasi di sisi service (defense in depth):
//  1) X-Gateway-Secret : request harus datang dari gateway
//  2) Access token     : tanda tangan + masa berlaku diverifikasi ULANG
// Request tanpa token valid ditolak walaupun membawa gateway secret.
// ============================================================
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const EXPECTED_SECRET = digest(config.gatewaySecret);

function verifyGateway(req, res, next) {
  const got = digest(req.get('x-gateway-secret') || '');
  if (!crypto.timingSafeEqual(got, EXPECTED_SECRET)) {
    return res.status(403).json({ error: 'forbidden', reason: 'request tidak melalui gateway' });
  }
  next();
}

function verifyToken(req, res, next) {
  const m = (req.get('authorization') || '').match(/^Bearer (\S+)$/i);
  if (!m) return res.status(401).json({ error: 'unauthorized', reason: 'access token tidak ada' });
  try {
    const c = jwt.verify(m[1], config.jwtSecret, {
      algorithms: ['HS256'], issuer: 'gateway-sistem-nilai',
    });
    req.auth = { sub: c.sub, role: c.role };
    next();
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'access token kedaluwarsa' : 'access token tidak valid';
    res.status(401).json({ error: 'unauthorized', reason });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.auth.role)
    ? next()
    : res.status(403).json({ error: 'forbidden', reason: `role ${req.auth.role} tidak diizinkan` });

module.exports = { verifyGateway, verifyToken, requireRole };
