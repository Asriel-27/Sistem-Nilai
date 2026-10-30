// ============================================================
// POLICY ENFORCEMENT POINT (PEP)
// Memeriksa access token, meminta keputusan ke Policy Engine,
// mencatat audit log, lalu meneruskan (atau menolak) request.
// ============================================================
const tokens = require('../tokens');
const policy = require('../policy');
const audit = require('../audit');

function enforce(req, res, next) {
  const deviceId = req.get('x-device-id') || null;
  const base = { method: req.method, endpoint: req.originalUrl, deviceId };

  const unauthorized = (reason) => {
    audit.log({ ...base, decision: 'deny', reason });
    return res.status(401).json({ error: 'unauthorized', reason });
  };

  // 1. Access token wajib ada dan valid (tanda tangan + masa berlaku)
  const m = (req.get('authorization') || '').match(/^Bearer (\S+)$/i);
  if (!m) return unauthorized('access token tidak ada');

  let claims;
  try {
    claims = tokens.verify(m[1]);
  } catch (err) {
    return unauthorized(err.name === 'TokenExpiredError'
      ? 'access token kedaluwarsa' : 'access token tidak valid');
  }

  const subject = claims.role === 'service'
    ? { type: 'service', id: claims.sub, role: 'service' }
    : { type: 'user', id: Number(claims.sub), role: claims.role, username: claims.usr };

  if (subject.type === 'user' && !Number.isInteger(subject.id)) {
    return unauthorized('klaim sub pada token tidak valid');
  }

  // 2. Minta keputusan ke Policy Engine (gagal = deny / fail closed)
  let decision;
  try {
    decision = policy.decide({
      subject, method: req.method, path: req.path, query: req.query, deviceId,
    });
  } catch (err) {
    console.error('[policy] error:', err);
    decision = { allow: false, reason: 'kesalahan internal policy engine (fail closed)', status: 500 };
  }

  // 3. Audit log: setiap keputusan dicatat
  audit.log({
    ...base,
    subject: subject.type === 'service' ? subject.id : (subject.username || `user:${subject.id}`),
    subjectType: subject.type,
    decision: decision.allow ? 'allow' : 'deny',
    reason: decision.reason,
  });

  // 4. Tegakkan keputusan
  if (!decision.allow) {
    return res.status(decision.status || 403).json({ error: 'forbidden', reason: decision.reason });
  }
  req.subject = subject;
  next();
}

module.exports = enforce;
