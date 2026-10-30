const express = require('express');
const db = require('./db');
const { requireRole } = require('./middleware');
const { sinkronTranskrip } = require('./transkripClient');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isId = (s) => typeof s === 'string' && /^[1-9]\d*$/.test(s);
const huruf = (n) => (n >= 85 ? 'A' : n >= 75 ? 'B' : n >= 65 ? 'C' : n >= 50 ? 'D' : 'E');
const NOT_OWNED = 'bukan kelas yang Anda ampu atau tidak ditemukan';

const SELECT_NILAI = `
  SELECT n.id, n.kelas_id, k.kode_mk, k.nama_mk, n.mahasiswa_id, u.nim, u.nama AS mahasiswa,
         n.nilai_angka, n.nilai_huruf, n.status, n.updated_at
    FROM nilai n
    JOIN kelas k ON k.id = n.kelas_id
    JOIN users u ON u.id = n.mahasiswa_id`;

// GET /nilai : data DISARING berdasarkan identitas di token (bukan parameter dari klien)
router.get('/nilai', requireRole('mahasiswa', 'dosen'), (req, res) => {
  const me = Number(req.auth.sub);
  const { kelas_id } = req.query;
  if (kelas_id !== undefined && !isId(kelas_id)) {
    return res.status(400).json({ error: 'bad_request', reason: 'kelas_id tidak valid' });
  }

  const where = [req.auth.role === 'mahasiswa' ? 'n.mahasiswa_id = ?' : 'k.dosen_id = ?'];
  const args = [me];
  if (kelas_id !== undefined) { where.push('n.kelas_id = ?'); args.push(Number(kelas_id)); }

  const rows = db.prepare(`${SELECT_NILAI} WHERE ${where.join(' AND ')} ORDER BY n.kelas_id, u.nim`).all(...args);
  res.json({ count: rows.length, data: rows });
});

// PUT /nilai/:id : dosen pemilik kelas, nilai belum final
router.put('/nilai/:id', requireRole('dosen'), (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'bad_request', reason: 'id tidak valid' });
  const angka = req.body && req.body.nilai_angka;
  if (typeof angka !== 'number' || !Number.isFinite(angka) || angka < 0 || angka > 100) {
    return res.status(400).json({ error: 'bad_request', reason: 'nilai_angka harus angka 0-100' });
  }

  const row = db.prepare(
    `SELECT n.id, n.status FROM nilai n JOIN kelas k ON k.id = n.kelas_id
      WHERE n.id = ? AND k.dosen_id = ?`).get(Number(req.params.id), Number(req.auth.sub));
  if (!row) return res.status(403).json({ error: 'forbidden', reason: `nilai ${NOT_OWNED}` });
  if (row.status === 'final') {
    return res.status(409).json({ error: 'conflict', reason: 'nilai sudah final dan tidak dapat diubah' });
  }

  db.prepare(`UPDATE nilai SET nilai_angka = ?, nilai_huruf = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(angka, huruf(angka), row.id);
  res.json(db.prepare(`${SELECT_NILAI} WHERE n.id = ?`).get(row.id));
});

// POST /kelas/:id/finalisasi : finalisasi lalu sinkron ke Service Transkrip (via gateway)
router.post('/kelas/:id/finalisasi', requireRole('dosen'), wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'bad_request', reason: 'id tidak valid' });
  const kelasId = Number(req.params.id);

  const kelas = db.prepare('SELECT id FROM kelas WHERE id = ? AND dosen_id = ?').get(kelasId, Number(req.auth.sub));
  if (!kelas) return res.status(403).json({ error: 'forbidden', reason: `kelas ${NOT_OWNED}` });

  const rows = db.prepare(`${SELECT_NILAI} WHERE n.kelas_id = ?`).all(kelasId);
  if (rows.length === 0) return res.status(409).json({ error: 'conflict', reason: 'kelas belum memiliki nilai' });
  if (rows.some((r) => r.nilai_angka === null)) {
    return res.status(409).json({ error: 'conflict', reason: 'masih ada nilai yang kosong' });
  }

  const finalized = db.prepare(
    `UPDATE nilai SET status = 'final', updated_at = datetime('now') WHERE kelas_id = ? AND status = 'draft'`
  ).run(kelasId).changes;

  // Idempotent: finalisasi ulang = sinkron ulang (aman bila sinkron sebelumnya gagal)
  try {
    const hasil = await sinkronTranskrip({
      kelas_id: kelasId,
      items: rows.map((r) => ({ nim: r.nim, nilai_angka: r.nilai_angka, nilai_huruf: r.nilai_huruf })),
    });
    res.json({ kelas_id: kelasId, difinalisasi: finalized, sinkron: hasil });
  } catch (err) {
    console.error('[service-nilai] sinkron gagal:', err.message);
    res.status(502).json({
      error: 'bad_gateway',
      reason: 'nilai sudah final, tetapi sinkron ke transkrip gagal; ulangi finalisasi untuk mengirim ulang',
      detail: err.message,
    });
  }
}));

module.exports = router;
