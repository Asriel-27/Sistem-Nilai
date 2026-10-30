// ============================================================
// POLICY ADMINISTRATOR (PA): login, refresh, logout, token service.
// ============================================================
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const tokens = require('../tokens');
const audit = require('../audit');

const router = express.Router();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10); // meratakan waktu respons user tak dikenal

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById:   db.prepare('SELECT * FROM users WHERE id = ?'),
  device:     db.prepare('SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ?'),
  insRefresh: db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at) VALUES (?,?,?,?)'),
  refByHash:  db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?'),
  revokeOne:  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?'),
  client:     db.prepare('SELECT * FROM service_clients WHERE client_id = ? AND active = 1'),
};

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const str = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

// Membuat access + refresh token baru
function issueTokens(user, deviceId) {
  const refresh = crypto.randomBytes(32).toString('hex');
  q.insRefresh.run(user.id, sha256(refresh), deviceId, Date.now() + config.refreshTtlMs);
  const access = tokens.signAccess(user);
  return {
    token_type: 'Bearer',
    access_token: access,
    expires_in: tokens.expiresInSeconds(access),
    refresh_token: refresh,
  };
}

// Helper audit + respons
function ctx(req, endpoint) {
  const deviceId = req.get('x-device-id') || null;
  const base = { method: 'POST', endpoint, deviceId };
  return {
    deviceId,
    deny(res, status, error, reason, who = {}) {
      audit.log({ ...base, ...who, decision: 'deny', reason });
      return res.status(status).json({ error, reason });
    },
    allow(who, reason) {
      audit.log({ ...base, ...who, decision: 'allow', reason });
    },
  };
}

// ---------- POST /auth/login ----------
router.post('/login', wrap(async (req, res) => {
  const c = ctx(req, '/auth/login');
  const { username, password } = req.body || {};
  const who = { subject: str(username, 50) ? username : 'anonymous', subjectType: 'user' };

  if (!str(username, 50) || !str(password, 200)) {
    return c.deny(res, 400, 'bad_request', 'username dan password wajib diisi', who);
  }
  if (!c.deviceId) {
    return c.deny(res, 400, 'bad_request', 'header X-Device-ID wajib', who);
  }

  const user = q.userByName.get(username);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    // Pesan ke klien sengaja generik (tidak membocorkan username mana yang ada)
    audit.log({ method: 'POST', endpoint: '/auth/login', deviceId: c.deviceId, ...who,
                decision: 'deny', reason: 'kredensial tidak valid' });
    return res.status(401).json({ error: 'unauthorized', reason: 'kredensial tidak valid' });
  }

  if (!q.device.get(user.id, c.deviceId)) {
    return c.deny(res, 403, 'forbidden', 'device tidak terdaftar untuk user ini', who);
  }

  c.allow(who, 'login berhasil; token diterbitkan');
  res.json(issueTokens(user, c.deviceId));
}));

// ---------- POST /auth/refresh ----------
router.post('/refresh', wrap(async (req, res) => {
  const c = ctx(req, '/auth/refresh');
  const { refresh_token } = req.body || {};
  if (!str(refresh_token, 200)) {
    return c.deny(res, 400, 'bad_request', 'refresh_token wajib diisi');
  }

  const row = q.refByHash.get(sha256(refresh_token));
  if (!row) return c.deny(res, 401, 'unauthorized', 'refresh token tidak dikenal');

  const user = q.userById.get(row.user_id);
  const who = { subject: user ? user.username : `user:${row.user_id}`, subjectType: 'user' };

  if (row.revoked) {
    return c.deny(res, 401, 'unauthorized', 'refresh token sudah dicabut', who);
  }
  if (row.expires_at < Date.now()) {
    return c.deny(res, 401, 'unauthorized', 'refresh token kedaluwarsa', who);
  }
  if (!user) return c.deny(res, 401, 'unauthorized', 'user tidak ditemukan', who);

  // Token terikat ke device saat login; device juga harus masih terdaftar
  if (c.deviceId !== row.device_id || !q.device.get(user.id, row.device_id)) {
    return c.deny(res, 403, 'forbidden', 'device tidak sesuai dengan refresh token', who);
  }

  // Refresh token tidak berubah; hanya access token baru yang diterbitkan
  const access = tokens.signAccess(user);
  c.allow(who, 'refresh berhasil; access token baru diterbitkan');
  res.json({ token_type: 'Bearer', access_token: access, expires_in: tokens.expiresInSeconds(access) });
}));

// ---------- POST /auth/logout ----------
router.post('/logout', wrap(async (req, res) => {
  const c = ctx(req, '/auth/logout');
  const { refresh_token } = req.body || {};
  if (!str(refresh_token, 200)) {
    return c.deny(res, 400, 'bad_request', 'refresh_token wajib diisi');
  }

  const row = q.refByHash.get(sha256(refresh_token));
  if (!row) return c.deny(res, 401, 'unauthorized', 'refresh token tidak dikenal');

  const user = q.userById.get(row.user_id);
  const who = { subject: user ? user.username : `user:${row.user_id}`, subjectType: 'user' };
  if (row.revoked) return c.deny(res, 401, 'unauthorized', 'refresh token sudah dicabut', who);

  q.revokeOne.run(row.id);
  c.allow(who, 'logout; refresh token dicabut');
  res.json({ message: 'logout berhasil, refresh token dicabut' });
}));

// ---------- POST /auth/service ----------
router.post('/service', wrap(async (req, res) => {
  const c = ctx(req, '/auth/service');
  const { client_id, client_secret } = req.body || {};
  const who = { subject: str(client_id, 50) ? client_id : 'anonymous', subjectType: 'service' };

  if (!str(client_id, 50) || !str(client_secret, 200)) {
    return c.deny(res, 400, 'bad_request', 'client_id dan client_secret wajib diisi', who);
  }

  const client = q.client.get(client_id);
  const ok = await bcrypt.compare(client_secret, client ? client.secret_hash : DUMMY_HASH);
  if (!client || !ok) {
    return c.deny(res, 401, 'unauthorized', 'client id atau secret tidak valid', who);
  }

  const token = tokens.signService(client.client_id);
  c.allow(who, 'token service diterbitkan');
  res.json({ token_type: 'Bearer', access_token: token, expires_in: tokens.expiresInSeconds(token) });
}));

// Endpoint /auth/* lain
router.use((req, res) => {
  audit.log({ method: req.method, endpoint: req.originalUrl, deviceId: req.get('x-device-id'),
              decision: 'deny', reason: 'endpoint auth tidak dikenal' });
  res.status(404).json({ error: 'not_found', reason: 'endpoint auth tidak dikenal' });
});

module.exports = router;
