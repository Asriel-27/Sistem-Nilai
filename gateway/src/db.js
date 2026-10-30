// Satu koneksi SQLite untuk seluruh modul gateway
const { openDb } = require('../../db/connection');
module.exports = openDb();
