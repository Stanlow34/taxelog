#!/usr/bin/env node
// create_admin_db.js
// Usage: node create_admin_db.js [username] [password]
// Creates or updates an admin user in MySQL via db/index.js
// Requires: npm install bcryptjs mysql2 dotenv

const bcrypt = require('bcryptjs');
const db = require('./db');

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'admin';

(async () => {
  try {
    const hash = bcrypt.hashSync(password, 10);
    await db.createUser({ username, fullname: 'Super Admin', password: hash, role: 'admin' });
    console.log(`Admin "${username}" created/updated successfully.`);
    await db.closePool();
    console.log('Done. Supprimez ce script ou changez le mot de passe par défaut après usage.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err && err.message ? err.message : err);
    try { await db.closePool(); } catch(_) {}
    process.exit(1);
  }
})();