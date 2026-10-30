// Koneksi SQLite bersama. Dipakai gateway, Service Nilai, dan Service Transkrip.
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbPath = path.resolve(
  path.join(__dirname, '..'),
  process.env.DB_PATH || './data/sistem-nilai.db'
);

function openDb(options = {}) {
  const db = new Database(dbPath, options);
  db.pragma('journal_mode = WAL');   // beberapa proses boleh membaca/menulis bersamaan
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

module.exports = { openDb, dbPath };
