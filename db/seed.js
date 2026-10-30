// Membuat ulang database + data awal. Jalankan: npm run seed
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { openDb, dbPath } = require('./connection');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(dbPath + ext)) fs.unlinkSync(dbPath + ext);
}

const db = openDb();
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const hash = (p) => bcrypt.hashSync(p, 10);
const huruf = (n) => (n >= 85 ? 'A' : n >= 75 ? 'B' : n >= 65 ? 'C' : n >= 50 ? 'D' : 'E');

const insUser = db.prepare(
  'INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?,?,?,?,?)'
);
const insDevice = db.prepare(
  'INSERT INTO devices (user_id, device_id, label) VALUES (?,?,?)'
);

const users = [
  // username, password, nama, role, nim, device_id
  ['admin',  'admin123',  'Admin Prodi',        'admin',     null,            'DEV-ADMIN-01'],
  ['dosen1', 'dosen123',  'Dr. Budi Santoso',   'dosen',     null,            'DEV-DSN-01'],
  ['dosen2', 'dosen123',  'Dr. Sari Wulandari', 'dosen',     null,            'DEV-DSN-02'],
  ['mhs1',   'mhs123',    'Andi Pratama',       'mahasiswa', '2210631170001', 'DEV-MHS-01'],
  ['mhs2',   'mhs123',    'Bella Putri',        'mahasiswa', '2210631170002', 'DEV-MHS-02'],
  ['mhs3',   'mhs123',    'Citra Dewi',         'mahasiswa', '2210631170003', 'DEV-MHS-03'],
];

const id = {};
db.transaction(() => {
  for (const [u, p, nama, role, nim, dev] of users) {
    const uid = insUser.run(u, hash(p), nama, role, nim).lastInsertRowid;
    insDevice.run(uid, dev, `Perangkat ${u}`);
    id[u] = Number(uid);
  }

  // 2 kelas, diampu dosen berbeda
  const insKelas = db.prepare(
    'INSERT INTO kelas (kode_mk, nama_mk, sks, semester, dosen_id) VALUES (?,?,?,?,?)'
  );
  const k1 = Number(insKelas.run('KP70065004', 'Keamanan Informasi', 3, '2026-Ganjil', id.dosen1).lastInsertRowid);
  const k2 = Number(insKelas.run('KP70065005', 'Basis Data Lanjut',  3, '2026-Ganjil', id.dosen2).lastInsertRowid);

  // Semua mahasiswa terdaftar di kedua kelas, status draft
  const insNilai = db.prepare(
    'INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, status) VALUES (?,?,?,?,?)'
  );
  const skor = {
    [k1]: { mhs1: 88, mhs2: 76, mhs3: 62 },
    [k2]: { mhs1: 81, mhs2: 90, mhs3: 70 },
  };
  for (const k of [k1, k2]) {
    for (const m of ['mhs1', 'mhs2', 'mhs3']) {
      insNilai.run(k, id[m], skor[k][m], huruf(skor[k][m]), 'draft');
    }
  }

  // Workload identity Service Nilai
  db.prepare('INSERT INTO service_clients (client_id, secret_hash, nama) VALUES (?,?,?)')
    .run(process.env.SERVICE_CLIENT_ID || 'service-nilai',
         hash(process.env.SERVICE_CLIENT_SECRET || 'svc-nilai-secret-dev'),
         'Service Nilai');
})();

console.log('Seed selesai ->', dbPath);
console.table(db.prepare(
  `SELECT u.username, u.role, u.nim, d.device_id
   FROM users u JOIN devices d ON d.user_id = u.id ORDER BY u.id`).all());
console.table(db.prepare(
  `SELECT k.id AS kelas_id, k.nama_mk, u.username AS dosen FROM kelas k JOIN users u ON u.id=k.dosen_id`).all());
db.close();
