const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function need(key) {
  if (!process.env[key]) { console.error(`[config] ${key} wajib diisi di .env`); process.exit(1); }
  return process.env[key];
}

module.exports = {
  port: Number(process.env.TRANSKRIP_PORT || 3002),
  jwtSecret: need('JWT_SECRET'),
  gatewaySecret: need('GATEWAY_SECRET'),
  // Hanya workload ini yang boleh menyinkronkan transkrip
  allowedServiceId: process.env.SERVICE_CLIENT_ID || 'service-nilai',
};
