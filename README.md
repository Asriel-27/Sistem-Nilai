# Sistem Nilai — Zero Trust Security

Tugas Praktikum Individu · Keamanan Informasi (KP70065004) · Informatika Universitas Siliwangi

Sistem Nilai dengan arsitektur **Zero Trust** berdasarkan NIST SP 800-207. API Gateway berperan sebagai
*Policy Enforcement Point* (PEP) yang terpisah dari service, dan setiap request, termasuk panggilan
antar-service, diperiksa ulang (*never trust, always verify; least privilege; assume breach*).

## Arsitektur

```
                  access token + X-Device-ID
  Client ───────────────────────────────────────►  API GATEWAY :3000   (PEP)
 (curl/Postman)                                    ├─ routes/auth.js        Policy Administrator
                                                   ├─ middleware/enforce.js PEP
                                                   ├─ policy.js             Policy Engine (allow/deny + alasan)
                                                   └─ audit.js              Audit Log
                                                        │  jika ALLOW + X-Gateway-Secret
                                      ┌─────────────────┴─────────────────┐
                                      ▼                                   ▼
                              SERVICE NILAI :3001                 SERVICE TRANSKRIP :3002
                              verifikasi secret + token           verifikasi secret + token
                                      │  finalisasi: POST /transkrip/sinkron
                                      └──── lewat gateway (token service) ──►
                                      ▼                                   ▼
                                  SQLite (data/sistem-nilai.db) — database bersama
```

| Komponen | Port | Peran (NIST SP 800-207) |
|---|---|---|
| API Gateway | 3000 | PEP + Policy Engine / Policy Administrator (modul di dalam gateway) |
| Service Nilai | 3001 | Resource: nilai dan kelas |
| Service Transkrip | 3002 | Resource: transkrip mahasiswa |
| SQLite | — | Resource + data source atribut (user, device, kelas, nilai) |
| `audit_log` | — | Data source: tabel di database, ditulis oleh gateway |

## Prasyarat

- **Node.js 18 atau lebih baru** (`fetch` bawaan dipakai untuk panggilan antar-service)
- npm
- Untuk menjalankan perintah `curl` di bawah: terminal bash (Linux/macOS, Git Bash, atau WSL).
  Pengguna Windows/Postman dapat memakai tabel skenario sebagai acuan.

## Cara menjalankan

```sh
# 1. Pasang dependensi (satu kali, semua workspace sekaligus)
npm install

# 2. Salin konfigurasi (Windows: copy .env.example .env)
cp .env.example .env

# 3. Buat database + data awal
npm run seed

# 4. Jalankan gateway + kedua service sekaligus
npm start
```

Gateway siap di `http://localhost:3000`. Tekan `Ctrl+C` untuk menghentikan ketiga proses.

Alternatif: tiga terminal terpisah dengan `npm run start:transkrip`, `npm run start:nilai`,
dan `npm run start:gateway`.

> **Catatan:** `npm run seed` menghapus dan membuat ulang database. Hentikan aplikasi terlebih dahulu
> sebelum menjalankannya, lalu jalankan `npm start` lagi.

## Frontend demo (opsional)

`npm start` juga menjalankan konsol demo di **http://localhost:3003**. Halaman ini hanya membantu demo; semua
request tetap dikirim browser langsung ke gateway (port 3000), seperti Postman. Wilayah yang ditampilkan pada jam
akses adalah **Tasikmalaya (WIB)**; perhitungan tetap memakai zona waktu `Asia/Jakarta`.

- **Sesi login**: pilih akun, ubah password atau device untuk mendemokan penolakan, klik *Login*, *Refresh*, atau *Logout*.
  *Login semua* mengambil token seluruh akun sekaligus.
- **Skenario cepat**: 22 permintaan siap klik (token, device, IDOR, finalisasi, sinkron). Angka di kanan tombol adalah
  status HTTP yang diharapkan; hasil akan menandai apakah sesuai.
- **Permintaan**: kirim endpoint apa pun sebagai akun tertentu dengan token (milik akun, tanpa token, palsu, atau token service)
  dan device (milik akun, kosong, atau device asing).
- **Keputusan** dan **Audit log (langsung)**: stempel ALLOW/DENY beserta alasannya, dan 14 catatan audit terbaru yang
  diperbarui setelah setiap klik. Waktu audit ditampilkan sesuai `ACCESS_TZ` (default WIB).
- Tombol **Kosongkan** pada panel audit meminta konfirmasi dan hanya menghapus isi tabel `audit_log`; nilai,
  transkrip, dan akun tidak diubah. Endpoint khusus demo hanya menerima origin UI yang dikonfigurasi.

Catatan: skenario mengubah data, jadi urutan klik sama seperti blok curl (hentikan aplikasi, `npm run seed`, `npm start`
untuk mengulang). Skenario 7 (akses langsung ke service dengan gateway secret) tetap lewat curl karena secret
tidak boleh berada di browser. Untuk demo jam akses, jalankan `ACCESS_HOUR_START=3 ACCESS_HOUR_END=4 npm start`.

Keamanan UI demo: gateway hanya memberi header CORS kepada origin `DEMO_UI_ORIGIN` (bawaan `localhost:3003`),
dan endpoint pengosongan audit pada `scripts/demo-ui.js` menolak origin yang tidak diizinkan. Ini fitur konsol demo,
bukan endpoint penghapusan audit pada gateway atau bagian dari sistem produksi. Hentikan dengan Ctrl+C bersama proses lain.

### Konfigurasi (`.env`)

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `JWT_SECRET` | *(wajib diganti)* | Kunci tanda tangan JWT (HS256) |
| `GATEWAY_SECRET` | *(wajib diganti)* | Nilai header `X-Gateway-Secret` |
| `SERVICE_CLIENT_ID` / `SERVICE_CLIENT_SECRET` | `service-nilai` / `svc-nilai-secret-dev` | Kredensial Service Nilai untuk `POST /auth/service` |
| `ACCESS_TOKEN_TTL` | `10m` | Masa berlaku access token |
| `REFRESH_TOKEN_TTL_HOURS` | `24` | Masa berlaku refresh token |
| `SERVICE_TOKEN_TTL` | `5m` | Masa berlaku token service |
| `ACCESS_HOUR_START` / `ACCESS_HOUR_END` | `7` / `21` | Jam akses ubah/finalisasi nilai (jam akhir eksklusif) |
| `ACCESS_TZ` | `Asia/Jakarta` | Zona waktu untuk jam akses |
| `DEMO_UI_PORT` / `DEMO_UI_ORIGIN` | `3003` / `http://localhost:3003,...` | Port UI demo dan origin yang boleh memanggil gateway (CORS) |

Setelah mengubah `.env`, hentikan lalu jalankan ulang `npm start`.

## Data awal (seed)

| Username | Password | Role | Device ID terdaftar | Keterangan |
|---|---|---|---|---|
| `admin` | `admin123` | admin | `DEV-ADMIN-01` | |
| `dosen1` | `dosen123` | dosen | `DEV-DSN-01` | Mengampu kelas **1** (Keamanan Informasi) |
| `dosen2` | `dosen123` | dosen | `DEV-DSN-02` | Mengampu kelas **2** (Basis Data Lanjut) |
| `mhs1` | `mhs123` | mahasiswa | `DEV-MHS-01` | NIM `2210631170001` |
| `mhs2` | `mhs123` | mahasiswa | `DEV-MHS-02` | NIM `2210631170002` |
| `mhs3` | `mhs123` | mahasiswa | `DEV-MHS-03` | NIM `2210631170003` |

Ketiga mahasiswa terdaftar di kedua kelas. Semua nilai awal berstatus `draft`. Setiap user hanya memiliki
**satu** device terdaftar.

Kredensial service: `client_id = service-nilai`, `client_secret = svc-nilai-secret-dev`.

Id nilai: kelas 1 → id 1–3 (mhs1, mhs2, mhs3), kelas 2 → id 4–6 (mhs1, mhs2, mhs3).

## Endpoint

| Endpoint | Diizinkan | Kondisi |
|---|---|---|
| `POST /auth/login` | Semua user | Kredensial valid dan device terdaftar |
| `POST /auth/refresh`, `/auth/logout` | Semua user | Refresh token valid dan belum dicabut. Refresh juga mewajibkan `X-Device-ID` yang sama dengan saat login |
| `POST /auth/service` | Service Nilai | Client ID dan secret valid |
| `GET /nilai` | Mahasiswa, dosen | Mahasiswa: hanya nilai miliknya. Dosen: hanya kelas yang diampu |
| `PUT /nilai/:id` | Dosen | Kelas yang diampu, nilai belum final, dalam jam akses. Body: `{"nilai_angka": 0-100}` |
| `POST /kelas/:id/finalisasi` | Dosen | Kelas yang diampu, dalam jam akses. Setelah itu Service Nilai memanggil sinkron transkrip |
| `GET /transkrip/:nim` | Mahasiswa, admin | Mahasiswa: hanya NIM sendiri. Admin: semua NIM |
| `POST /transkrip/sinkron` | Service Nilai | Hanya token service. Token user mana pun ditolak |

Semua endpoint selain `/auth/*` wajib membawa `Authorization: Bearer <access_token>` dan
`X-Device-ID: <device terdaftar>`.

## Pemetaan kebutuhan → kode

| Kebutuhan (bagian 4) | Lokasi kode |
|---|---|
| 4.1 Access token JWT 10 menit (`sub`, `role`) | `gateway/src/tokens.js` (`signAccess`) |
| 4.1 Refresh token di database, bisa dicabut, logout mencabut | `gateway/src/routes/auth.js` (`/refresh`, `/logout`), tabel `refresh_tokens` |
| 4.1 Token service 5 menit, `role: service` | `gateway/src/routes/auth.js` (`/service`), `gateway/src/tokens.js` (`signService`) |
| 4.1 Gateway secret | Gateway menambahkan: `gateway/src/proxy.js`. Service menolak: `service-*/src/middleware.js` (`verifyGateway`) |
| 4.1 Verifikasi ulang token di service | `service-*/src/middleware.js` (`verifyToken`) |
| 4.2 Kebijakan akses (Tabel 3) dan kepemilikan data dari DB | `gateway/src/policy.js` (`RULES`, `decide`) |
| 4.2 PEP: periksa token, minta keputusan, teruskan | `gateway/src/middleware/enforce.js` |
| 4.3 Device terdaftar (`X-Device-ID`) | `gateway/src/policy.js` (langkah 3 di `decide`), tabel `devices` |
| 4.3 Jam akses yang dapat dikonfigurasi | `gateway/src/policy.js` (`inAccessHours`), `.env` (`ACCESS_HOUR_*`) |
| 4.4 Audit log | `gateway/src/audit.js`, tabel `audit_log`, `npm run audit` |
| Panggilan antar-service lewat gateway | `service-nilai/src/transkripClient.js` |
| Object-level authorization di service (anti-IDOR) | `service-nilai/src/routes.js`, `service-transkrip/src/routes.js` |

## Pengujian dengan curl

Jalankan `npm start` di satu terminal, lalu buka terminal lain. Semua blok `bash` di bawah dijalankan
berurutan dalam **satu sesi terminal** (variabel dari blok awal dipakai blok berikutnya).

> Pengujian di sini mengubah data (nilai berubah, kelas difinalisasi). Untuk mengulang dari awal:
> hentikan aplikasi, `npm run seed`, lalu `npm start`.

### 0. Persiapan: fungsi bantu dan login semua akun

```bash
G=http://localhost:3000
J='Content-Type: application/json'
# Mengambil satu field dari JSON di stdin (memakai Node.js, tanpa jq)
field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)['$1']))"; }
login() { curl -s -X POST $G/auth/login -H "$J" -H "X-Device-ID: $2" -d "{\"username\":\"$1\",\"password\":\"$3\"}"; }

MHS1=$(login mhs1 DEV-MHS-01 mhs123);   T_MHS1=$(echo "$MHS1" | field access_token); R_MHS1=$(echo "$MHS1" | field refresh_token)
T_MHS2=$(login mhs2 DEV-MHS-02 mhs123   | field access_token)
T_DOSEN1=$(login dosen1 DEV-DSN-01 dosen123 | field access_token)
T_DOSEN2=$(login dosen2 DEV-DSN-02 dosen123 | field access_token)
T_ADMIN=$(login admin DEV-ADMIN-01 admin123 | field access_token)
T_SERVICE=$(curl -s -X POST $G/auth/service -H "$J" \
  -d '{"client_id":"service-nilai","client_secret":"svc-nilai-secret-dev"}' | field access_token)
echo "token terambil: mhs1=${#T_MHS1} dosen1=${#T_DOSEN1} admin=${#T_ADMIN} service=${#T_SERVICE} karakter"
```

### 1. Autentikasi dan token (4.1)

```bash
# 1a. Login berhasil -> 200, berisi access_token (expires_in 600) dan refresh_token
echo "$MHS1" | cut -c1-120

# 1b. Password salah -> 401
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/login -H "$J" -H "X-Device-ID: DEV-MHS-01" \
  -d '{"username":"mhs1","password":"salah"}'

# 1c. Device tidak terdaftar -> 403
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/login -H "$J" -H "X-Device-ID: DEV-ASING" \
  -d '{"username":"mhs1","password":"mhs123"}'

# 1d. Refresh -> 200, hanya access token baru (refresh token tetap)
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/refresh -H "$J" -H "X-Device-ID: DEV-MHS-01" \
  -d "{\"refresh_token\":\"$R_MHS1\"}" | cut -c1-100

# 1e. Refresh dari device lain -> 403
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/refresh -H "$J" -H "X-Device-ID: DEV-MHS-02" \
  -d "{\"refresh_token\":\"$R_MHS1\"}"

# 1f. Logout -> 200, refresh token dicabut
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/logout -H "$J" -d "{\"refresh_token\":\"$R_MHS1\"}"

# 1g. Refresh setelah logout -> 401
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/refresh -H "$J" -H "X-Device-ID: DEV-MHS-01" \
  -d "{\"refresh_token\":\"$R_MHS1\"}"

# 1h. Token service dengan secret salah -> 401
curl -s -w ' [%{http_code}]\n' -X POST $G/auth/service -H "$J" \
  -d '{"client_id":"service-nilai","client_secret":"salah"}'
```

> **Demo token kedaluwarsa:** ubah `ACCESS_TOKEN_TTL=10s` di `.env`, jalankan ulang `npm start`,
> login, tunggu 10 detik, lalu panggil `GET /nilai` dengan token tersebut → 401 "access token kedaluwarsa".

### 2. Verifikasi token di gateway (PEP)

```bash
# 2a. Tanpa token -> 401
curl -s -w ' [%{http_code}]\n' $G/nilai -H "X-Device-ID: DEV-MHS-01"

# 2b. Token palsu -> 401
curl -s -w ' [%{http_code}]\n' $G/nilai -H "Authorization: Bearer abc.def.ghi" -H "X-Device-ID: DEV-MHS-01"

# 2c. Gateway secret palsu dari klien tidak berpengaruh (gateway menimpanya) -> 200
curl -s -o /dev/null -w '[%{http_code}]\n' $G/nilai -H "Authorization: Bearer $T_MHS1" \
  -H "X-Device-ID: DEV-MHS-01" -H "X-Gateway-Secret: PALSU"
```

### 3. Kebijakan akses per role (4.2, Tabel 3)

```bash
# 3a. Mahasiswa melihat nilai sendiri -> 200 (hanya baris milik mhs1)
curl -s -w ' [%{http_code}]\n' $G/nilai -H "Authorization: Bearer $T_MHS1" -H "X-Device-ID: DEV-MHS-01" | cut -c1-150

# 3b. Mahasiswa meminta data mahasiswa lain -> 403
curl -s -w ' [%{http_code}]\n' "$G/nilai?nim=2210631170002" -H "Authorization: Bearer $T_MHS1" -H "X-Device-ID: DEV-MHS-01"

# 3c. Dosen1 melihat nilai kelasnya -> 200 (hanya kelas 1)
curl -s -w ' [%{http_code}]\n' "$G/nilai?kelas_id=1" -H "Authorization: Bearer $T_DOSEN1" -H "X-Device-ID: DEV-DSN-01" | cut -c1-150

# 3d. Dosen1 meminta kelas dosen2 (IDOR) -> 403
curl -s -w ' [%{http_code}]\n' "$G/nilai?kelas_id=2" -H "Authorization: Bearer $T_DOSEN1" -H "X-Device-ID: DEV-DSN-01"

# 3e. Admin melihat nilai -> 403 (admin hanya boleh melihat transkrip)
curl -s -w ' [%{http_code}]\n' $G/nilai -H "Authorization: Bearer $T_ADMIN" -H "X-Device-ID: DEV-ADMIN-01"

# 3f. Dosen1 mengubah nilai id 1 (kelas 1, draft) -> 200
curl -s -w ' [%{http_code}]\n' -X PUT $G/nilai/1 -H "$J" -H "Authorization: Bearer $T_DOSEN1" \
  -H "X-Device-ID: DEV-DSN-01" -d '{"nilai_angka":91}' | cut -c1-200

# 3g. Dosen1 mengubah nilai id 4 (kelas dosen2) -> 403
curl -s -w ' [%{http_code}]\n' -X PUT $G/nilai/4 -H "$J" -H "Authorization: Bearer $T_DOSEN1" \
  -H "X-Device-ID: DEV-DSN-01" -d '{"nilai_angka":100}'

# 3h. Mahasiswa mengubah nilai -> 403
curl -s -w ' [%{http_code}]\n' -X PUT $G/nilai/1 -H "$J" -H "Authorization: Bearer $T_MHS1" \
  -H "X-Device-ID: DEV-MHS-01" -d '{"nilai_angka":100}'
```

### 4. Verifikasi konteks (4.3)

```bash
# 4a. Token sah, tetapi X-Device-ID milik user lain -> 403
curl -s -w ' [%{http_code}]\n' $G/nilai -H "Authorization: Bearer $T_MHS1" -H "X-Device-ID: DEV-MHS-02"

# 4b. Token sah, tanpa X-Device-ID -> 403
curl -s -w ' [%{http_code}]\n' $G/nilai -H "Authorization: Bearer $T_MHS1"
```

Jam akses (07.00–21.00 WIB) diuji dengan mengatur ulang rentang jam di `.env`, misalnya agar sekarang
berada di luar jam akses:

```sh
# .env  (contoh: jam akses hanya 03.00-04.00, hentikan lalu jalankan ulang npm start)
ACCESS_HOUR_START=3
ACCESS_HOUR_END=4
```

Lalu ulangi 3f (`PUT /nilai/1`) atau finalisasi → **403 "di luar jam akses (3.00-4.00 Asia/Jakarta)"**.
`GET /nilai` tetap 200 karena pembatasan jam hanya untuk ubah dan finalisasi nilai.

### 5. Finalisasi dan sinkron transkrip antar-service

```bash
# 5a. Transkrip mhs1 sebelum finalisasi -> kosong (total_sks 0)
curl -s -w ' [%{http_code}]\n' $G/transkrip/2210631170001 -H "Authorization: Bearer $T_MHS1" -H "X-Device-ID: DEV-MHS-01"

# 5b. Dosen1 memfinalisasi kelas dosen2 -> 403
curl -s -w ' [%{http_code}]\n' -X POST $G/kelas/2/finalisasi -H "Authorization: Bearer $T_DOSEN1" -H "X-Device-ID: DEV-DSN-01"

# 5c. Dosen1 memfinalisasi kelas 1 -> 200; Service Nilai memanggil sinkron lewat gateway
curl -s -w ' [%{http_code}]\n' -X POST $G/kelas/1/finalisasi -H "Authorization: Bearer $T_DOSEN1" -H "X-Device-ID: DEV-DSN-01"

# 5d. Transkrip mhs1 setelah finalisasi -> berisi mata kuliah kelas 1 dan IPK
curl -s -w ' [%{http_code}]\n' $G/transkrip/2210631170001 -H "Authorization: Bearer $T_MHS1" -H "X-Device-ID: DEV-MHS-01"

# 5e. Mengubah nilai yang sudah final -> 403
curl -s -w ' [%{http_code}]\n' -X PUT $G/nilai/1 -H "$J" -H "Authorization: Bearer $T_DOSEN1" \
  -H "X-Device-ID: DEV-DSN-01" -d '{"nilai_angka":50}'
```

### 6. Transkrip dan sinkron (Tabel 3)

```bash
# 6a. Mahasiswa melihat transkrip NIM lain -> 403
curl -s -w ' [%{http_code}]\n' $G/transkrip/2210631170001 -H "Authorization: Bearer $T_MHS2" -H "X-Device-ID: DEV-MHS-02"

# 6b. Admin melihat transkrip siapa pun -> 200
curl -s -w ' [%{http_code}]\n' $G/transkrip/2210631170001 -H "Authorization: Bearer $T_ADMIN" -H "X-Device-ID: DEV-ADMIN-01" | cut -c1-120

# 6c. Dosen melihat transkrip -> 403
curl -s -w ' [%{http_code}]\n' $G/transkrip/2210631170001 -H "Authorization: Bearer $T_DOSEN1" -H "X-Device-ID: DEV-DSN-01"

# 6d. Sinkron dengan token USER (admin) -> 403: hanya token service
curl -s -w ' [%{http_code}]\n' -X POST $G/transkrip/sinkron -H "$J" -H "Authorization: Bearer $T_ADMIN" \
  -H "X-Device-ID: DEV-ADMIN-01" -d '{"kelas_id":1,"items":[]}'

# 6e. Token service dipakai di endpoint lain -> 403
curl -s -w ' [%{http_code}]\n' $G/nilai -H "Authorization: Bearer $T_SERVICE"

# 6f. Token service di endpoint sinkron (payload kosong ditolak validasi) -> 400
curl -s -w ' [%{http_code}]\n' -X POST $G/transkrip/sinkron -H "$J" -H "Authorization: Bearer $T_SERVICE" \
  -d '{"kelas_id":1,"items":[]}'
```

### 7. Mengakses service langsung (melewati gateway)

```bash
GW_SECRET=$(grep '^GATEWAY_SECRET=' .env | cut -d= -f2)

# 7a. Tanpa X-Gateway-Secret -> 403
curl -s -w ' [%{http_code}]\n' http://localhost:3001/nilai

# 7b. Secret salah -> 403
curl -s -w ' [%{http_code}]\n' http://localhost:3002/transkrip/2210631170001 -H "X-Gateway-Secret: salah"

# 7c. Secret benar, tetapi tanpa token -> 401 (verifikasi ulang di service)
curl -s -w ' [%{http_code}]\n' http://localhost:3001/nilai -H "X-Gateway-Secret: $GW_SECRET"

# 7d. Secret benar + token palsu -> 401
curl -s -w ' [%{http_code}]\n' http://localhost:3002/transkrip/2210631170001 \
  -H "X-Gateway-Secret: $GW_SECRET" -H "Authorization: Bearer abc.def.ghi"

# 7e. Gateway "jebol": secret bocor + token dosen1 valid, minta kelas dosen2 -> service tetap
#     menyaring berdasarkan identitas di token (hasil kosong, bukan data kelas 2)
curl -s -w ' [%{http_code}]\n' "http://localhost:3001/nilai?kelas_id=2" \
  -H "X-Gateway-Secret: $GW_SECRET" -H "Authorization: Bearer $T_DOSEN1"

# 7f. Gateway "jebol": mengubah nilai kelas dosen2 dengan token dosen1 -> 403 dari service
curl -s -w ' [%{http_code}]\n' -X PUT http://localhost:3001/nilai/4 -H "$J" \
  -H "X-Gateway-Secret: $GW_SECRET" -H "Authorization: Bearer $T_DOSEN1" -d '{"nilai_angka":100}'
```

### 8. Audit log (4.4)

```sh
npm run audit              # 20 catatan terakhir
npm run audit -- 50        # 50 catatan terakhir
npm run audit -- --deny    # hanya keputusan yang ditolak
```

Kolom: waktu, subjek (user atau service), tipe, method, endpoint, device, hasil (`allow`/`deny`), alasan.
Percobaan login yang gagal dan token tidak valid juga tercatat (subjek `anonymous` bila tidak diketahui).

## Struktur proyek

```
sistem-nilai/
├── package.json            npm workspaces + skrip (start, seed, audit)
├── .env.example
├── db/                     schema.sql, seed.js, connection.js
├── scripts/                start-all.js, audit.js, demo-ui.js
├── demo-ui/                index.html (konsol demo, tanpa build)
├── gateway/src/            index, config, db, tokens, policy, audit, proxy
│   ├── middleware/enforce.js   PEP
│   ├── middleware/cors.js      CORS khusus origin UI demo
│   └── routes/auth.js          Policy Administrator
├── service-nilai/src/      index, config, db, middleware, routes, transkripClient
└── service-transkrip/src/  index, config, db, middleware, routes
```

## Keputusan desain dan keterbatasan

- **Default deny.** Endpoint yang tidak ada di `RULES` (`policy.js`) ditolak.
- **Atribut dari database.** Kepemilikan kelas, NIM, role, dan device dibaca dari DB, tidak dipercaya dari isi token.
- **Refresh token terikat device**, disimpan sebagai hash SHA-256 (bukan token mentah), dan dicabut saat logout.
- **Pesan login generik** untuk username salah atau password salah, dengan perataan waktu respons.
- **Pesan "tidak ditemukan atau bukan milik Anda"** dipakai untuk id yang tidak ada maupun milik orang lain,
  agar klien tidak dapat menebak id yang valid.
- **Satu database bersama** sesuai spesifikasi tugas: secara teknis kedua service dapat membaca semua tabel.
  Mitigasinya adalah setiap service hanya mengakses tabelnya sendiri dan akses dari luar hanya lewat gateway.
- **JWT HS256 dengan secret bersama** agar sederhana. Pengembangan lanjutan: RS256, sehingga service hanya
  memegang public key.
- **Logout hanya mencabut refresh token.** Access token tetap berlaku hingga masa berlakunya habis (10 menit),
  sehingga masa berlakunya sengaja dibuat pendek.
- **Belum ada TLS dan rate limiting.** Aplikasi berjalan lokal untuk keperluan praktikum. Di produksi, komunikasi
  gateway–service sebaiknya memakai mTLS dan endpoint login diberi pembatasan percobaan.
