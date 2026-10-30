// Audit log: gateway mencatat SETIAP keputusan akses (allow maupun deny).
const db = require('./db');

const insert = db.prepare(`
  INSERT INTO audit_log (subject, subject_type, method, endpoint, device_id, decision, reason)
  VALUES (@subject, @subject_type, @method, @endpoint, @device_id, @decision, @reason)
`);

function log({ subject = 'anonymous', subjectType = 'anonymous', method, endpoint,
               deviceId = null, decision, reason }) {
  const row = {
    subject: String(subject).slice(0, 100),
    subject_type: subjectType,
    method,
    endpoint: String(endpoint).slice(0, 200),
    device_id: deviceId ? String(deviceId).slice(0, 100) : null,
    decision,
    reason,
  };
  try {
    insert.run(row);
  } catch (err) {
    console.error('[audit] gagal menulis audit_log:', err.message);
  }
  console.log(
    `[audit] ${decision.toUpperCase().padEnd(5)} ${subjectType}:${row.subject} ` +
    `${method} ${row.endpoint} dev=${row.device_id} :: ${reason}`
  );
}

module.exports = { log };
