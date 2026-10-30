// Menampilkan audit log.  Pemakaian:
//   npm run audit            -> 20 catatan terakhir
//   npm run audit -- 50      -> 50 catatan terakhir
//   npm run audit -- --deny  -> hanya yang ditolak
const { openDb } = require('../db/connection');
const args = process.argv.slice(2);
const onlyDeny = args.includes('--deny');
const limit = Number(args.find((a) => /^\d+$/.test(a))) || 20;
const timeZone = process.env.ACCESS_TZ || 'Asia/Jakarta';

const db = openDb({ readonly: true });
const rows = db.prepare(
  `SELECT * FROM (
     SELECT id, ts, subject, subject_type AS tipe, method, endpoint, device_id AS device, decision AS hasil, reason AS alasan
       FROM audit_log ${onlyDeny ? "WHERE decision = 'deny'" : ''}
      ORDER BY id DESC LIMIT ?) ORDER BY id`
).all(limit);
const formatTime = (ts) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};
console.table(rows.map(({ id, ts, ...r }) => ({ waktu: formatTime(ts), ...r })));
console.log(`${rows.length} catatan ditampilkan.`);
