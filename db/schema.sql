-- Skema database bersama (SQLite) untuk Sistem Nilai
PRAGMA foreign_keys = ON;

-- ===== Atribut subjek =====
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim           TEXT UNIQUE            -- hanya terisi untuk mahasiswa
);

-- Device terdaftar per user (dasar cek X-Device-ID)
CREATE TABLE devices (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label     TEXT,
  UNIQUE (user_id, device_id)
);

-- ===== Resource: Service Nilai =====
CREATE TABLE kelas (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_mk  TEXT NOT NULL,
  nama_mk  TEXT NOT NULL,
  sks      INTEGER NOT NULL,
  semester TEXT NOT NULL,
  dosen_id INTEGER NOT NULL REFERENCES users(id)   -- dasar "kelas yang diampu"
);

CREATE TABLE nilai (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id     INTEGER NOT NULL REFERENCES kelas(id),
  mahasiswa_id INTEGER NOT NULL REFERENCES users(id),
  nilai_angka  REAL,
  nilai_huruf  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kelas_id, mahasiswa_id)
);

-- ===== Resource: Service Transkrip =====
CREATE TABLE transkrip (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mahasiswa_id INTEGER NOT NULL REFERENCES users(id),
  kelas_id     INTEGER NOT NULL REFERENCES kelas(id),
  kode_mk      TEXT NOT NULL,
  nama_mk      TEXT NOT NULL,
  sks          INTEGER NOT NULL,
  nilai_angka  REAL NOT NULL,
  nilai_huruf  TEXT NOT NULL,
  synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mahasiswa_id, kelas_id)                  -- sinkron ulang = upsert, bukan duplikat
);

-- ===== Data Policy Administrator =====
-- Disimpan sebagai hash SHA-256 agar token mentah tidak tersimpan di DB
CREATE TABLE refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,                     -- epoch ms
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Workload identity untuk token service
CREATE TABLE service_clients (
  client_id   TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  nama        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

-- ===== Audit log (ditulis oleh gateway) =====
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  subject      TEXT,           -- username / client_id / 'anonymous'
  subject_type TEXT,           -- 'user' | 'service' | 'anonymous'
  method       TEXT,
  endpoint     TEXT,
  device_id    TEXT,
  decision     TEXT NOT NULL CHECK (decision IN ('allow','deny')),
  reason       TEXT NOT NULL
);

CREATE INDEX idx_nilai_kelas  ON nilai(kelas_id);
CREATE INDEX idx_nilai_mhs    ON nilai(mahasiswa_id);
CREATE INDEX idx_kelas_dosen  ON kelas(dosen_id);
CREATE INDEX idx_rt_user      ON refresh_tokens(user_id);
CREATE INDEX idx_audit_ts     ON audit_log(ts);
