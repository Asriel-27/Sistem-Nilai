// Server kecil untuk UI demo. BUKAN bagian arsitektur sistem: menyajikan halaman dan mengelola audit demo.
// Seluruh request ke sistem tetap dikirim browser ke gateway (port 3000).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { openDb } = require('../db/connection');

const port = Number(process.env.DEMO_UI_PORT || 3003);
const page = path.join(__dirname, '..', 'demo-ui', 'index.html');
const allowedOrigins = (process.env.DEMO_UI_ORIGIN ||
  `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map((s) => s.trim());
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(page));
  }
  if (u.pathname === '/demo-api/audit') {
    const limit = Math.min(Number(u.searchParams.get('limit')) || 14, 100);
    try {
      const db = openDb({ readonly: true });
      const rows = db.prepare('SELECT id, ts, subject, subject_type, method, endpoint, device_id, decision, reason FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
      db.close();
      return json(res, 200, rows);
    } catch (e) {
      console.error('[demo-ui] gagal membaca audit log:', e);
      return json(res, 500, { error: 'internal_error' });
    }
  }
  if (u.pathname === '/demo-api/audit/clear') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (!allowedOrigins.includes(req.headers.origin)) {
      return json(res, 403, { error: 'forbidden', reason: 'origin tidak diizinkan' });
    }
    let db;
    try {
      db = openDb();
      const { changes } = db.prepare('DELETE FROM audit_log').run();
      return json(res, 200, { deleted: changes });
    } catch (e) {
      console.error('[demo-ui] gagal mengosongkan audit log:', e);
      return json(res, 500, { error: 'internal_error' });
    } finally {
      if (db) db.close();
    }
  }
  if (u.pathname === '/demo-api/info') {
    const start = Number(process.env.ACCESS_HOUR_START ?? 7), end = Number(process.env.ACCESS_HOUR_END ?? 21);
    const tz = process.env.ACCESS_TZ || 'Asia/Jakarta';
    const h = parseInt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date()), 10);
    return json(res, 200, { start, end, tz, hour: h, inHours: h >= start && h < end });
  }
  json(res, 404, { error: 'not_found' });
}).listen(port, () => console.log(`[demo-ui] http://localhost:${port}`));
