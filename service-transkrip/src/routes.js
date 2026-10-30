const express = require('express');
const db = require('./db');
const config = require('./config');
const { requireRole } = require('./middleware');

const router = express.Router();
const BOBOT = { A: 4, B: 3, C: 2, D: 1, E: 0 };

const q = {
  userNim:  db.prepare('SELECT nim FROM users WHERE id = ?'),
  mhsByNim: db.prepare(`SELECT id, nim, nama FROM users WHERE nim = ? AND role = 'mahasiswa'`),
  items:    db.prepare(
    `SELECT kode_mk, nama_mk, sks, nilai_angka, nilai_huruf, synced_at
       FROM transkrip WHERE mahasiswa_id = ? ORDER BY kode_mk`),
  kelas:    db.prepare('SELECT id, kode_mk, nama_mk, sks FROM kelas WHERE id = ?'),
  nilaiFinal: db.prepare(
    `SELECT 1 AS ok FROM nilai WHERE kelas_id = ? AND mahasiswa_id = ? AND status = 'final'`),
  upsert: db.prepare(`
    INSERT INTO transkrip (mahasiswa_id, kelas_id, kode_mk, nama_mk, sks, nilai_angka, nilai_huruf)
    VALUES (@mahasiswa_id, @kelas_id, @kode_mk, @nama_mk, @sks, @nilai_angka, @nilai_huruf)
    ON CONFLICT (mahasiswa_id, kelas_id) DO UPDATE SET
      nilai_angka = excluded.nilai_angka, nilai_huruf = excluded.nilai_huruf,
      kode_mk = excluded.kode_mk, nama_mk = excluded.nama_mk, sks = excluded.sks,
      synced_at = datetime('now')`),
};

// GET /transkrip/:nim : mahasiswa hanya NIM sendiri, admin semua
router.get('/transkrip/:nim', requireRole('mahasiswa', 'admin'), (req, res) => {
  const { nim } = req.params;
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(nim)) {
    return res.status(400).json({ error: 'bad_request', reason: 'NIM tidak valid' });
  }
  if (req.auth.role === 'mahasiswa') {
    const me = q.userNim.get(Number(req.auth.sub));
    if (!me || me.nim !== nim) {
      return res.status(403).json({ error: 'forbidden', reason: 'mahasiswa hanya boleh melihat transkrip NIM sendiri' });
    }
  }

  const mhs = q.mhsByNim.get(nim);
  if (!mhs) return res.status(404).json({ error: 'not_found', reason: 'mahasiswa tidak ditemukan' });

  const items = q.items.all(mhs.id);
  const totalSks = items.reduce((a, i) => a + i.sks, 0);
  const mutu = items.reduce((a, i) => a + BOBOT[i.nilai_huruf] * i.sks, 0);
  res.json({
    nim: mhs.nim, nama: mhs.nama,
    total_sks: totalSks,
    ipk: totalSks ? Math.round((mutu / totalSks) * 100) / 100 : 0,
    mata_kuliah: items,
  });
});

// POST /transkrip/sinkron : HANYA token service (token user mana pun ditolak)
router.post('/transkrip/sinkron', (req, res) => {
  if (req.auth.role !== 'service' || req.auth.sub !== config.allowedServiceId) {
    return res.status(403).json({ error: 'forbidden', reason: 'hanya token service yang diizinkan' });
  }

  const { kelas_id, items } = req.body || {};
  const kelas = Number.isInteger(kelas_id) ? q.kelas.get(kelas_id) : undefined;
  if (!kelas) return res.status(400).json({ error: 'bad_request', reason: 'kelas_id tidak dikenal' });
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    return res.status(400).json({ error: 'bad_request', reason: 'items wajib berupa array (1-500)' });
  }
  for (const it of items) {
    const ok = it && typeof it.nim === 'string' && typeof it.nilai_angka === 'number'
      && it.nilai_angka >= 0 && it.nilai_angka <= 100 && BOBOT[it.nilai_huruf] !== undefined;
    if (!ok) return res.status(400).json({ error: 'bad_request', reason: 'format item tidak valid' });
  }

  try {
    const n = db.transaction(() => {
      for (const it of items) {
        const mhs = q.mhsByNim.get(it.nim);
        if (!mhs) throw Object.assign(new Error(`NIM ${it.nim} tidak dikenal`), { bad: true });
        // Defense in depth: hanya nilai yang berstatus final yang boleh masuk transkrip
        if (!q.nilaiFinal.get(kelas.id, mhs.id)) {
          throw Object.assign(new Error(`nilai NIM ${it.nim} belum final`), { bad: true });
        }
        q.upsert.run({
          mahasiswa_id: mhs.id, kelas_id: kelas.id, kode_mk: kelas.kode_mk, nama_mk: kelas.nama_mk,
          sks: kelas.sks, nilai_angka: it.nilai_angka, nilai_huruf: it.nilai_huruf,
        });
      }
      return items.length;
    })();
    res.json({ kelas_id: kelas.id, tersinkron: n });
  } catch (err) {
    if (err.bad) return res.status(422).json({ error: 'unprocessable', reason: err.message });
    throw err;
  }
});

module.exports = router;
