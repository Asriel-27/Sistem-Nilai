// ============================================================
// API GATEWAY (port 3000) - satu-satunya pintu masuk.
// Alur: /auth/* ditangani PA  ->  selain itu: PEP -> PE -> audit -> proxy
// ============================================================
const express = require('express');
const config = require('./config');
const audit = require('./audit');
const authRoutes = require('./routes/auth');
const enforce = require('./middleware/enforce');
const proxy = require('./proxy');
const cors = require('./middleware/cors');

const app = express();
app.disable('x-powered-by');
app.use(cors); // hanya untuk origin UI demo

// Body hanya di-parse untuk /auth. Request ke service diteruskan apa adanya (stream).
app.use('/auth', express.json({ limit: '10kb' }), authRoutes);

// Semua request lain wajib melewati PEP
app.use(enforce);
app.use(proxy.nilai);
app.use(proxy.transkrip);

// Seharusnya tak tercapai: endpoint tak dikenal sudah di-deny oleh policy
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// Error handler (mis. JSON body rusak)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.type === 'entity.parse.failed' ? 400 : 500;
  audit.log({ method: req.method, endpoint: req.originalUrl, deviceId: req.get('x-device-id'),
              decision: 'deny', reason: status === 400 ? 'body JSON tidak valid' : 'kesalahan internal' });
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 400 ? 'bad_request' : 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`[gateway] PEP berjalan di http://localhost:${config.port}`);
  console.log(`[gateway] jam akses ${config.hours.start}.00-${config.hours.end}.00 (${config.hours.tz})`);
});
