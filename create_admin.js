#!/usr/bin/env node
// create_admin.js
// Usage:
//   node create_admin.js [username] [password]
//
// Creates or updates a user in data/users.json and ensures role === 'admin'.
// Backs up the existing users file before writing.
// Requires bcryptjs: npm install bcryptjs

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'admin';

function ensureDataDirAndFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf8');
    console.log(`Created empty users file: ${USERS_FILE}`);
  }
}

function readUsers() {
  try {
    const txt = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    console.warn('Failed to read users.json, starting from empty array:', e.message || e);
    return [];
  }
}

function writeUsersSafe(users) {
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
}

(async function main() {
  try {
    ensureDataDirAndFile();
    const users = readUsers();

    // backup
    const bak = USERS_FILE + '.bak.' + Date.now();
    try { fs.copyFileSync(USERS_FILE, bak); console.log(`Backup written to ${bak}`); } catch (_) {}

    const hash = bcrypt.hashSync(password, 10);
    const existing = users.find(u => u.username === username);

    if (existing) {
      existing.password = hash;
      existing.role = 'admin';
      existing.fullname = existing.fullname || 'Super Admin';
      console.log(`Updated existing user "${username}" to role "admin" and replaced password.`);
    } else {
      users.push({ username, fullname: 'Super Admin', password: hash, role: 'admin' });
      console.log(`Created new admin user "${username}".`);
    }

    writeUsersSafe(users);
    console.log('Users file updated successfully.');

    console.log('\nNext steps:');
    console.log(`- Restart the server if needed.`);
    console.log(`- Log in via the UI or API using: username="${username}" password="${password}"`);
    console.log('  Example curl to login:');
    console.log(`    curl -s -X POST -H "Content-Type: application/json" -d '{"login":"${username}","password":"${password}"}' http://localhost:3000/api/login`);
    console.log('\nSecurity note: remove this script or change the default password after first use.');
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();