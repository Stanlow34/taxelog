// migrate_json_to_mysql.js
// Script to migrate existing data/*.json files into the MySQL DB.
// Usage: node migrate_json_to_mysql.js
// It will read data/users.json, data/informationstaxe.json, data/informationstns.json, data/informationsimmo.json, data/config.json
// Install deps: npm install mysql2 dotenv

const fs = require('fs');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  users: 'users.json',
  taxe: 'informationstaxe.json',
  tns: 'informationstns.json',
  immo: 'informationsimmo.json',
  config: 'config.json'
};

function readJsonSafe(p) {
  if(!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8') || 'null');
  } catch (e) {
    console.error(`Failed to parse ${p}:`, e && e.message ? e.message : e);
    return null;
  }
}

(async () => {
  try {
    // Users
    const usersPath = path.join(DATA_DIR, FILES.users);
    const users = readJsonSafe(usersPath) || [];
    for (const u of users) {
      // If password seems plain text (dangerous) we still insert as-is;
      // prefer hashed passwords — if you used bcrypt in original app they should already be hashed.
      let password = u.password || '';
      // If looks like plain (no $2a$) you may choose to re-hash (dangerous: loses original).
      if (password && !password.startsWith('$2')) {
        // Re-hash plaintext password
        password = bcrypt.hashSync(password, 10);
      }
      await db.createUser({ username: u.username, fullname: u.fullname || null, password, role: u.role || 'user' });
      console.log(`User migrated: ${u.username}`);
    }

    // Data types
    const types = { taxe: FILES.taxe, tns: FILES.tns, immo: FILES.immo };
    for (const [type, fname] of Object.entries(types)) {
      const p = path.join(DATA_DIR, fname);
      const obj = readJsonSafe(p) || {};
      // obj expected: { username: { year: payload, ... }, ... }
      for (const username of Object.keys(obj)) {
        const byYear = obj[username] || {};
        for (const year of Object.keys(byYear)) {
          const payload = byYear[year] || {};
          await db.setEntry(username, type, year, payload);
          console.log(`Entry migrated: ${type} ${username} ${year}`);
        }
      }
    }

    // Config
    const cfgPath = path.join(DATA_DIR, FILES.config);
    const cfg = readJsonSafe(cfgPath);
    if (cfg) {
      await db.setConfig(cfg);
      console.log('Config migrated.');
    }

    console.log('Migration complete.');
    await db.closePool();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    try { await db.closePool(); } catch(_) {}
    process.exit(1);
  }
})();