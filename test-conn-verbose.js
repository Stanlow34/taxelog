// test-conn-verbose.js
// Exécuter: node test-conn-verbose.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const HOST = process.env.MYSQL_HOST || 'cgdllbb.cluster021.hosting.ovh.net';
const PORT = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT,10) : 3306;
const SOCKET = process.env.MYSQL_SOCKET || '';
const USER = process.env.MYSQL_USER || 'cgdllbb72';
const PASSWORD = process.env.MYSQL_PASSWORD || 'Styven34170';
const DB = process.env.MYSQL_DATABASE || 'cgdllbb72';

async function tryTcp() {
  console.log('Trying TCP', HOST, PORT);
  const conn = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB, connectTimeout: 5000 });
  const [rows] = await conn.query('SELECT 1 as ok');
  await conn.end();
  return rows;
}
async function trySocket() {
  console.log('Trying socket', SOCKET);
  const conn = await mysql.createConnection({ socketPath: SOCKET, user: USER, password: PASSWORD, database: DB, connectTimeout: 5000 });
  const [rows] = await conn.query('SELECT 1 as ok');
  await conn.end();
  return rows;
}

(async () => {
  try {
    const r = await tryTcp();
    console.log('TCP OK:', r);
    process.exit(0);
  } catch (eTcp) {
    console.warn('TCP failed:', eTcp && eTcp.code ? `${eTcp.code}` : eTcp && eTcp.message);
    if (SOCKET) {
      try {
        const rs = await trySocket();
        console.log('Socket OK:', rs);
        process.exit(0);
      } catch (eSock) {
        console.error('Socket failed:', eSock && eSock.code ? `${eSock.code}` : eSock && eSock.message);
        console.error('Both TCP and socket attempts failed. Full errors:');
        console.error('TCP error:', eTcp);
        console.error('Socket error:', eSock);
        process.exit(1);
      }
    } else {
      console.error('TCP attempt failed and no MYSQL_SOCKET configured. Error detail:');
      console.error(eTcp);
      process.exit(1);
    }
  }
})();