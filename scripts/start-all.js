// Menjalankan Service Transkrip, Service Nilai, dan API Gateway sekaligus.
// Log tiap proses diberi awalan warna. Ctrl+C menghentikan ketiganya.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');

if (!fs.existsSync(path.join(root, '.env'))) {
  console.error('File .env belum ada. Jalankan: cp .env.example .env  (Windows: copy .env.example .env)');
  process.exit(1);
}
const { dbPath } = require('../db/connection');
if (!fs.existsSync(dbPath)) {
  console.error('Database belum dibuat. Jalankan dulu: npm run seed');
  process.exit(1);
}

// Service dijalankan lebih dulu, gateway terakhir
const apps = [
  { name: 'transkrip', color: '\x1b[35m', file: 'service-transkrip/src/index.js' },
  { name: 'nilai    ', color: '\x1b[36m', file: 'service-nilai/src/index.js' },
  { name: 'gateway  ', color: '\x1b[32m', file: 'gateway/src/index.js' },
  { name: 'demo-ui  ', color: '\x1b[33m', file: 'scripts/demo-ui.js' },
];

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill());
  setTimeout(() => process.exit(code), 300);
}

for (const app of apps) {
  const child = spawn(process.execPath, [path.join(root, app.file)], {
    cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `${app.color}[${app.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach((l) => out.write(prefix + l + '\n'));
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${prefix}berhenti (kode ${code}); menghentikan semua proses`);
      stopAll(1);
    }
  });
  children.push(child);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
