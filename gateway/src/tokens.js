// Penerbitan & verifikasi JWT (HS256). Dipakai oleh Policy Administrator dan PEP.
const jwt = require('jsonwebtoken');
const config = require('./config');

const ISSUER = 'gateway-sistem-nilai';
const BASE = { algorithm: 'HS256', issuer: ISSUER };

// Access token user: sub = id user, role = role user (usr hanya untuk kemudahan audit)
function signAccess(user) {
  return jwt.sign({ role: user.role, usr: user.username }, config.jwtSecret, {
    ...BASE, subject: String(user.id), expiresIn: config.accessTtl,
  });
}

// Token service: sub = client_id, role = 'service'
function signService(clientId) {
  return jwt.sign({ role: 'service' }, config.jwtSecret, {
    ...BASE, subject: clientId, expiresIn: config.serviceTtl,
  });
}

// Algoritma dikunci ke HS256 (menolak alg:none / algorithm confusion)
function verify(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER });
}

function expiresInSeconds(token) {
  const { exp, iat } = jwt.decode(token);
  return exp - iat;
}

module.exports = { signAccess, signService, verify, expiresInSeconds };
