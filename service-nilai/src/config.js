const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function need(key) {
  if (!process.env[key]) { console.error(`[config] ${key} wajib diisi di .env`); process.exit(1); }
  return process.env[key];
}

module.exports = {
  port: Number(process.env.NILAI_PORT || 3001),
  jwtSecret: need('JWT_SECRET'),
  gatewaySecret: need('GATEWAY_SECRET'),
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3000',
  clientId: process.env.SERVICE_CLIENT_ID || 'service-nilai',
  clientSecret: need('SERVICE_CLIENT_SECRET'),
};
