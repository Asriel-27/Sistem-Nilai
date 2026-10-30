// Meneruskan request yang sudah di-ALLOW ke service, dengan header X-Gateway-Secret.
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config');

function makeProxy(target, pathRegex) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: (pathname) => pathRegex.test(pathname),
    on: {
      proxyReq: (proxyReq) => {
        // setHeader menimpa nilai yang mungkin dikirim klien (anti-spoofing)
        proxyReq.setHeader('X-Gateway-Secret', config.gatewaySecret);
      },
      error: (err, req, res) => {
        console.error('[proxy] upstream error:', err.message);
        if (res && typeof res.writeHead === 'function' && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad_gateway', reason: 'service tidak dapat dihubungi' }));
        }
      },
    },
  });
}

module.exports = {
  nilai: makeProxy(config.nilaiUrl, /^\/(nilai|kelas)(\/|$)/),
  transkrip: makeProxy(config.transkripUrl, /^\/transkrip(\/|$)/),
};
