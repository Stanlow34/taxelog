// db/index.js
// MySQL helper with verbose connection attempts and socket fallback.
// Installez: npm install mysql2 dotenv
require('dotenv').config();
const mysql = require('mysql2/promise');

const HOST = process.env.MYSQL_HOST || 'cgdllbb.cluster021.hosting.ovh.net';
const PORT = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306;
const USER = process.env.MYSQL_USER || 'cgdllbb72';
const PASSWORD = process.env.MYSQL_PASSWORD || 'Styven34170';
const DATABASE = process.env.MYSQL_DATABASE || 'cgdllbb72';
const SOCKET = process.env.MYSQL_SOCKET || ''; // ex: /var/run/mysqld/mysqld.sock
const CONNECT_TIMEOUT = process.env.MYSQL_CONNECT_TIMEOUT ? parseInt(process.env.MYSQL_CONNECT_TIMEOUT,10) : 5000; // ms

let pool = null;

async function createPoolTcp() {
  return mysql.createPool({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    connectTimeout: CONNECT_TIMEOUT
  });
}

async function createPoolSocket() {
  return mysql.createPool({
    socketPath: SOCKET,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    connectTimeout: CONNECT_TIMEOUT
  });
}

async function ensurePool() {
  if (pool) return pool;
  // Try TCP first
  try {
    pool = await createPoolTcp();
    // quick test connection
    const conn = await pool.getConnection();
    conn.release();
    console.log(`[db] Connected to MySQL via TCP ${HOST}:${PORT}`);
    return pool;
  } catch (errTcp) {
    console.warn(`[db] TCP connection to ${HOST}:${PORT} failed:`, errTcp && errTcp.code ? `${errTcp.code}` : errTcp.message);
    // If socket configured, try it
    if (SOCKET) {
      try {
        pool = await createPoolSocket();
        const conn = await pool.getConnection();
        conn.release();
        console.log(`[db] Connected to MySQL via socket ${SOCKET}`);
        return pool;
      } catch (errSock) {
        console.error(`[db] Socket connection to ${SOCKET} failed:`, errSock && errSock.code ? `${errSock.code}` : errSock.message);
        // throw combined error
        const e = new Error(`MySQL connection failed (TCP: ${errTcp.message}; SOCKET: ${errSock.message})`);
        e.tcp = errTcp;
        e.socket = errSock;
        throw e;
      }
    }
    // No socket or socket attempt not configured
    const e2 = new Error(`MySQL TCP connection failed: ${errTcp.message}`);
    e2.tcp = errTcp;
    throw e2;
  }
}

async function query(sql, params = []) {
  const p = await ensurePool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

// Users
async function getUserByUsername(username) {
  const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] || null;
}
async function createUser({ username, fullname, password, role = 'user' }) {
  const sql = `
    INSERT INTO users (username, fullname, password, role)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE fullname = VALUES(fullname), password = VALUES(password), role = VALUES(role)
  `;
  await query(sql, [username, fullname || null, password, role]);
  return getUserByUsername(username);
}

// Config
async function getConfig() {
  const rows = await query('SELECT value FROM config WHERE `key` = ?', ['app_config']);
  if (!rows[0]) return null;
  try { return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value; } catch (e) { return rows[0].value; }
}
async function setConfig(obj) {
  const sql = `
    INSERT INTO config (\`key\`, value)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE value = VALUES(value)
  `;
  await query(sql, ['app_config', JSON.stringify(obj)]);
  return true;
}

// Entries
async function getEntriesByUserType(username, type, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const totalRows = await query('SELECT COUNT(*) as c FROM entries WHERE username = ? AND type = ?', [username, type]);
  const total = totalRows[0] ? parseInt(totalRows[0].c, 10) : 0;
  const rows = await query('SELECT year, payload FROM entries WHERE username = ? AND type = ? ORDER BY year DESC LIMIT ? OFFSET ?', [username, type, limit, offset]);
  const parsed = rows.map(r => ({ year: r.year, payload: (typeof r.payload === 'string') ? JSON.parse(r.payload) : r.payload }));
  return { total, rows: parsed };
}
async function getEntry(username, type, year) {
  const rows = await query('SELECT payload FROM entries WHERE username = ? AND type = ? AND year = ?', [username, type, year]);
  if (!rows[0]) return null;
  return (typeof rows[0].payload === 'string') ? JSON.parse(rows[0].payload) : rows[0].payload;
}
async function setEntry(username, type, year, payload) {
  const sql = `INSERT INTO entries (username, type, year, payload) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)`;
  await query(sql, [username, type, year, JSON.stringify(payload || {})]);
  return true;
}
async function deleteEntry(username, type, year) {
  await query('DELETE FROM entries WHERE username = ? AND type = ? AND year = ?', [username, type, year]);
  return true;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  query,
  getUserByUsername,
  createUser,
  getConfig,
  setConfig,
  getEntriesByUserType,
  getEntry,
  setEntry,
  deleteEntry,
  closePool,
  // Expose connection params for diagnostics
  __conn: { HOST, PORT, SOCKET, CONNECT_TIMEOUT }
};