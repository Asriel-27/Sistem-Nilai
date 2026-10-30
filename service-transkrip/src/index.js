// SERVICE TRANSKRIP (port 3002) - hanya dapat diakses melalui gateway
const express = require('express');
const config = require('./config');
const { verifyGateway, verifyToken } = require('./middleware');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
app.use(verifyGateway);                    // 1. harus dari gateway
app.use(express.json({ limit: '100kb' }));
app.use(verifyToken);                      // 2. token diverifikasi ulang
app.use(routes);
app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const bad = err.type === 'entity.parse.failed';
  if (!bad) console.error(err);
  res.status(bad ? 400 : 500).json({ error: bad ? 'bad_request' : 'internal_error' });
});

app.listen(config.port, () => console.log(`[service-transkrip] berjalan di port ${config.port}`));
