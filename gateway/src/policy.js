// ============================================================
// POLICY ENGINE (PE) - memutuskan ALLOW / DENY + alasan
// Implementasi Tabel 3 + verifikasi konteks (4.3).
// Atribut dibaca dari database, BUKAN hanya dari isi token.
// Prinsip: default deny.
// ============================================================
const db = require('./db');
const config = require('./config');

const allow = (reason) => ({ allow: true, reason });
const deny = (reason, status = 403) => ({ allow: false, reason, status });

// ---- Query atribut (prepared statement) ----
const q = {
  user:    db.prepare('SELECT id, username, role, nim FROM users WHERE id = ?'),
  device:  db.prepare('SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ?'),
  client:  db.prepare('SELECT client_id, active FROM service_clients WHERE client_id = ?'),
  kelas:   db.prepare('SELECT id, dosen_id FROM kelas WHERE id = ?'),
  nilaiOwner: db.prepare(
    `SELECT n.id, n.status, k.dosen_id
       FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?`),
};

// ---- Konteks: jam akses ----
function currentHour(now) {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: config.hours.tz,
  }).format(now);
  return parseInt(h, 10);
}
function inAccessHours(now = new Date()) {
  const h = currentHour(now);
  return h >= config.hours.start && h < config.hours.end;
}

// ---- Aturan per endpoint (Tabel 3) ----
const NOT_OWNED = 'bukan kelas yang Anda ampu atau tidak ditemukan';

const RULES = [
  { // GET /nilai : mahasiswa (milik sendiri), dosen (kelas yang diampu)
    method: 'GET', re: /^\/nilai\/?$/, roles: ['mahasiswa', 'dosen'],
    check({ user, query }) {
      for (const k of ['kelas_id', 'mahasiswa_id', 'nim']) {
        if (query[k] !== undefined && typeof query[k] !== 'string') {
          return deny(`parameter ${k} tidak valid`, 400);
        }
      }
      if (user.role === 'mahasiswa') {
        if (query.mahasiswa_id !== undefined && Number(query.mahasiswa_id) !== user.id) {
          return deny('mahasiswa hanya boleh melihat nilai miliknya (mahasiswa_id lain ditolak)');
        }
        if (query.nim !== undefined && query.nim !== user.nim) {
          return deny('mahasiswa hanya boleh melihat nilai miliknya (nim lain ditolak)');
        }
        return allow('mahasiswa melihat nilai miliknya sendiri');
      }
      // dosen
      if (query.kelas_id !== undefined) {
        const id = Number(query.kelas_id);
        const k = Number.isInteger(id) ? q.kelas.get(id) : undefined;
        if (!k || k.dosen_id !== user.id) return deny(`kelas ${NOT_OWNED}`);
      }
      return allow('dosen melihat nilai kelas yang diampunya');
    },
  },
  { // PUT /nilai/:id : dosen, kelas diampu, belum final, dalam jam akses
    method: 'PUT', re: /^\/nilai\/([1-9]\d*)\/?$/, roles: ['dosen'], hours: true,
    check({ user, params }) {
      const row = q.nilaiOwner.get(Number(params[0]));
      if (!row || row.dosen_id !== user.id) return deny(`nilai ${NOT_OWNED}`);
      if (row.status === 'final') return deny('nilai sudah final dan tidak dapat diubah');
      return allow('dosen mengubah nilai pada kelas yang diampu (status draft, dalam jam akses)');
    },
  },
  { // POST /kelas/:id/finalisasi : dosen, kelas diampu, dalam jam akses
    method: 'POST', re: /^\/kelas\/([1-9]\d*)\/finalisasi\/?$/, roles: ['dosen'], hours: true,
    check({ user, params }) {
      const k = q.kelas.get(Number(params[0]));
      if (!k || k.dosen_id !== user.id) return deny(`kelas ${NOT_OWNED}`);
      return allow('dosen memfinalisasi kelas yang diampu (dalam jam akses)');
    },
  },
  { // GET /transkrip/:nim : mahasiswa (NIM sendiri), admin (semua)
    method: 'GET', re: /^\/transkrip\/([A-Za-z0-9_-]+)\/?$/, roles: ['mahasiswa', 'admin'],
    check({ user, params }) {
      if (user.role === 'admin') return allow('admin melihat transkrip seluruh mahasiswa');
      if (user.nim && user.nim === params[0]) return allow('mahasiswa melihat transkrip NIM sendiri');
      return deny('mahasiswa hanya boleh melihat transkrip dengan NIM sendiri');
    },
  },
  { // POST /transkrip/sinkron : hanya token service
    method: 'POST', re: /^\/transkrip\/sinkron\/?$/, roles: ['service'],
    check: () => allow('token service valid untuk sinkron transkrip'),
  },
];

/**
 * @param {object} ctx
 *  subject  : { type: 'user'|'service', id, role }
 *  method, path, query, deviceId, now
 * @returns {{allow:boolean, reason:string, status?:number}}
 */
function decide(ctx) {
  const { subject, method, path, query = {}, deviceId, now = new Date() } = ctx;

  // 1. Endpoint harus dikenal (default deny)
  const rule = RULES.find((r) => r.method === method && r.re.test(path));
  if (!rule) return deny('endpoint tidak dikenal (default deny)', 404);

  // 2. Verifikasi subjek terhadap atribut di database
  let user = null;
  let role;
  if (subject.type === 'service') {
    const c = q.client.get(subject.id);
    if (!c || !c.active) return deny('service client tidak terdaftar atau nonaktif');
    role = 'service';
  } else {
    user = q.user.get(subject.id);
    if (!user) return deny('user tidak ditemukan');
    if (user.role !== subject.role) return deny('role pada token tidak sesuai dengan database');

    // 3. Verifikasi konteks: device terdaftar (4.3)
    if (!deviceId) return deny('header X-Device-ID tidak ada');
    if (!q.device.get(user.id, deviceId)) return deny('device tidak terdaftar untuk user ini');
    role = user.role;
  }

  // 4. Role (RBAC)
  if (!rule.roles.includes(role)) return deny(`role ${role} tidak diizinkan untuk endpoint ini`);

  // 5. Verifikasi konteks: jam akses (4.3)
  if (rule.hours && !inAccessHours(now)) {
    const { start, end, tz } = config.hours;
    return deny(`di luar jam akses (${start}.00-${end}.00 ${tz})`);
  }

  // 6. Kepemilikan data / kondisi objek (object-level authorization)
  return rule.check({ user, query, params: path.match(rule.re).slice(1) });
}

module.exports = { decide, inAccessHours };
