// Menampilkan audit log.  Pemakaian:
//   npm run audit            -> 20 catatan terakhir
//   npm run audit -- 50      -> 50 catatan terakhir
//   npm run audit -- --deny  -> hanya yang ditolak
const { openDb } = require('../db/connection');
const args = process.argv.slice(2);
const onlyDeny = args.includes('--deny');
const limit = Number(args.find((a) => /^\d+$/.test(a))) || 20;

const db = openDb({ readonly: true });
const rows = db.prepare(
  `SELECT * FROM (
     SELECT id, ts, subject, subject_type AS tipe, method, endpoint, device_id AS device, decision AS hasil, reason AS alasan
       FROM audit_log ${onlyDeny ? "WHERE decision = 'deny'" : ''}
      ORDER BY id DESC LIMIT ?) ORDER BY id`
).all(limit);
console.table(rows.map(({ id, ts, ...r }) => ({ waktu: ts.replace('T', ' ').slice(0, 19), ...r })));
console.log(`${rows.length} catatan ditampilkan.`);
