// Memanggil Service Transkrip MELALUI GATEWAY dengan token service (bukan langsung).
const jwt = require('jsonwebtoken');
const config = require('./config');

let cache = { token: null, expMs: 0 };

async function getServiceToken(force = false) {
  if (!force && cache.token && Date.now() < cache.expMs - 30_000) return cache.token;
  const r = await fetch(`${config.gatewayUrl}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`gagal mengambil token service (HTTP ${r.status})`);
  const { access_token } = await r.json();
  cache = { token: access_token, expMs: jwt.decode(access_token).exp * 1000 };
  return access_token;
}

async function sinkronTranskrip(payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getServiceToken(attempt > 0);
    const r = await fetch(`${config.gatewayUrl}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 401 && attempt === 0) continue; // token kedaluwarsa -> ambil token baru, coba sekali lagi
    if (!r.ok) throw new Error(`sinkron ditolak (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

module.exports = { sinkronTranskrip };
