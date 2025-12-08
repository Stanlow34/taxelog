// diag-db.js
// Exécuter: node diag-db.js
try {
  const resolved = require.resolve('./db');
  console.log('require.resolve(./db) ->', resolved);
} catch (e) {
  console.error('require.resolve failed:', e && e.message);
}
try {
  const db = require('./db');
  console.log('Typeof db:', typeof db);
  console.log('Keys on db:', Object.keys(db || {}));
  console.log('db.createUser ===', db && typeof db.createUser);
} catch (err) {
  console.error('require("./db") threw:', err && err.stack ? err.stack : err);
}