// Konfigurasi gateway. Semua nilai dibaca dari ../../.env
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function need(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`[config] ${key} wajib diisi di .env`);
    process.exit(1);
  }
  return v;
}

module.exports = {
  port: Number(process.env.GATEWAY_PORT || 3000),
  nilaiUrl: process.env.NILAI_URL || 'http://localhost:3001',
  transkripUrl: process.env.TRANSKRIP_URL || 'http://localhost:3002',

  jwtSecret: need('JWT_SECRET'),
  gatewaySecret: need('GATEWAY_SECRET'),

  accessTtl: process.env.ACCESS_TOKEN_TTL || '10m',
  serviceTtl: process.env.SERVICE_TOKEN_TTL || '5m',
  refreshTtlMs: Number(process.env.REFRESH_TOKEN_TTL_HOURS || 24) * 3600 * 1000,

  // Jam akses untuk perubahan/finalisasi nilai (end bersifat eksklusif: 21 = sampai 20.59)
  hours: {
    start: Number(process.env.ACCESS_HOUR_START ?? 7),
    end: Number(process.env.ACCESS_HOUR_END ?? 21),
    tz: process.env.ACCESS_TZ || 'Asia/Jakarta',
  },
};
