// --- au début du fichier server.js, require le module db et enlevez readJSONFileSync/writeJSONFileSync usages ---
const db = require('./db'); // chemin relatif selon emplacement
// 
// server.js - ajoute gestion de rôles (visuel, editeur, admin) et endpoints admin/config + admin/users
// Routes protégées pour administration et configuration dynamique des formulaires / couleurs
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

const FILES = {
  users: 'users.json',
  taxe: 'informationstaxe.json',
  tns: 'informationstns.json',
  immo: 'informationsimmo.json',
  config: 'admin-config.json'
};

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_for_production';
const JWT_EXPIRES_IN = '2h';

app.use(cors());
app.use(express.json());
app.disable('etag');
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

console.log('[startup] __dirname=', __dirname, 'cwd=', process.cwd(), 'DATA_DIR=', DATA_DIR);

function ensureDataDirSync(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for(const fname of Object.values(FILES)){
    const p = path.join(DATA_DIR, fname);
    if(!fs.existsSync(p)){
      const initial = (fname === FILES.users) ? [] : (fname === FILES.config ? {
        registrationFields: [
          { name: "fullname", label: "Nom complet", type: "text", required: true },
          { name: "username", label: "Identifiant (email ou pseudo)", type: "text", required: true },
          { name: "password", label: "Mot de passe", type: "password", required: true }
        ],
        forms: {
          taxe: [
            { name: "revenu", label: "Revenu fiscal", type: "number" },
            { name: "revenu_conjoint", label: "Revenu fiscal conjoint", type: "number" },
            { name: "nb_enfants", label: "Nombre d'enfants", type: "number" },
            { name: "nb_charge", label: "Nombre de personnes à charge", type: "number" }
          ],
          tns: [
            { name: "revenu", label: "Revenu", type: "number" },
            { name: "charges", label: "Charges", type: "number" },
            { name: "foncier", label: "Foncier", type: "number" },
            { name: "madelin", label: "Madelin", type: "number" }
          ],
          immo: [
            { name: "revenu", label: "Revenu", type: "number" },
            { name: "charges", label: "Charges", type: "number" },
            { name: "dispositif", label: "Dispositif", type: "text" },
            { name: "deficit", label: "Déficit antérieur", type: "number" }
          ]
        },
        fullPageColors: {
          background: "#ffffff",
          header: "#0d6efd",
          accent: "#2dbf73",
          text: "#0b2a2b"
        }
      } : {});
      fs.writeFileSync(p, JSON.stringify(initial, null, 2), 'utf8');
      console.log(`[init] created ${p}`);
    }
  }
}
ensureDataDirSync();

function readJSONFileSync(fname){
  const p = path.join(DATA_DIR, fname);
  try {
    const txt = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(txt);
    // if config or user files corrupted, attempt minimal repair logic
    if(parsed && typeof parsed === 'object') return parsed;
    // otherwise replace with safe default
    return (fname === FILES.users) ? [] : {};
  } catch (err){
    console.error(`[readJSONFileSync] error reading/parsing ${p}:`, err && err.message ? err.message : err);
    // return safe defaults
    return (fname === FILES.users) ? [] : {};
  }
}

function writeJSONFileSync(fname, data){
  const p = path.join(DATA_DIR, fname);
  const tmp = p + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, p);
    return true;
  } catch (err) {
    console.error(`[writeJSONFileSync] error writing ${p}:`, err && err.message ? err.message : err);
    try { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_) {}
    throw err;
  }
}

function typeToFile(type){
  if(type === 'taxe') return FILES.taxe;
  if(type === 'tns') return FILES.tns;
  if(type === 'immo') return FILES.immo;
  return null;
}

function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authenticateToken(req, res, next){
  const auth = req.headers['authorization'];
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { username, iat, exp }
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token', reason: e.message });
  }
}

function requireAdmin(req, res, next){
  // need to check users.json for role
  const username = req.user && req.user.username;
  if(!username) return res.status(401).json({ error: 'missing_token' });
  const users = readJSONFileSync(FILES.users);
  const u = users.find(x => x.username === username);
  if(!u || !u.role || (u.role !== 'admin')) {
    return res.status(403).json({ error: 'forbidden', message: 'admin only' });
  }
  next();
}

// --- Auth / user endpoints ---

app.post('/api/register', (req, res) => {
  const { username, fullname, password } = req.body || {};
  if(!username || !fullname || !password) return res.status(400).json({ error: 'missing' });
  const users = readJSONFileSync(FILES.users);
  if(users.find(u => u.username === username)) return res.status(400).json({ error: 'exists' });
  const hash = bcrypt.hashSync(password, 10);
  // default role: visuel
  const role = 'visuel';
  users.push({ username, fullname, password: hash, role });
  writeJSONFileSync(FILES.users, users);

  // init data shapes
  for (const f of [FILES.taxe, FILES.tns, FILES.immo]) {
    const obj = readJSONFileSync(f);
    if(!obj[username]) obj[username] = {};
    writeJSONFileSync(f, obj);
  }
  const token = signToken({ username });
  res.json({ username, fullname, token, role });
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body || {};
  if(!login || !password) return res.status(400).json({ error: 'missing' });
  const users = readJSONFileSync(FILES.users);
  const user = users.find(u => (u.username === login || u.email === login));
  if(!user) return res.status(401).json({ error: 'invalid' });
  const ok = bcrypt.compareSync(password, user.password);
  if(!ok) return res.status(401).json({ error: 'invalid' });
  const token = signToken({ username: user.username });
  res.json({ username: user.username, fullname: user.fullname, token, role: user.role || 'visuel' });
});

// return current user profile (username, fullname, role)
app.get('/api/me', authenticateToken, (req, res) => {
  const username = req.user.username;
  const users = readJSONFileSync(FILES.users);
  const u = users.find(x => x.username === username);
  if(!u) return res.status(404).json({ error: 'not_found' });
  res.json({ username: u.username, fullname: u.fullname, role: u.role || 'visuel' });
});

// List users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = readJSONFileSync(FILES.users).map(u => ({ username: u.username, fullname: u.fullname, role: u.role || 'visuel' }));
  res.json({ data: users });
});

// Update user's role (admin only)
app.put('/api/admin/users/:username/role', authenticateToken, requireAdmin, (req, res) => {
  const target = req.params.username;
  const { role } = req.body || {};
  if(!role || !['visuel','editeur','admin'].includes(role)) return res.status(400).json({ error: 'invalid_role' });
  const users = readJSONFileSync(FILES.users);
  const u = users.find(x => x.username === target);
  if(!u) return res.status(404).json({ error: 'not_found' });
  u.role = role;
  writeJSONFileSync(FILES.users, users);
  res.json({ ok: true, username: u.username, role: u.role });
});

// --- Config endpoints ---
// Public GET config (so front-end can render dynamic forms)
app.get('/api/config', authenticateToken, (req, res) => {
  const cfg = readJSONFileSync(FILES.config);
  res.json(cfg);
});

// Admin update config
app.put('/api/admin/config', authenticateToken, requireAdmin, (req, res) => {
  const body = req.body || {};
  // basic validation: must be object
  if(!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid_body' });
  const cfg = readJSONFileSync(FILES.config);
  // merge shallowly (admin can supply any part)
  const merged = Object.assign({}, cfg, body);
  try {
    writeJSONFileSync(FILES.config, merged);
    res.json({ ok: true, config: merged });
  } catch (e) {
    res.status(500).json({ error: 'write_failed', message: String(e) });
  }
});

// --- Data endpoints (same as before) ---
app.get('/api/data/:type/:username', authenticateToken, (req, res) => {
  const { type, username } = req.params;
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  const fname = typeToFile(type);
  if(!fname) return res.status(400).json({ error: 'unknown type' });
  const data = readJSONFileSync(fname);
  const userData = data[username] || {};
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));
  const yearsArr = Object.keys(userData).sort((a,b)=> b.localeCompare(a)).map(y => ({ year: y, values: userData[y] }));
  const total = yearsArr.length;
  const start = (page-1)*limit;
  const pageData = yearsArr.slice(start,start+limit);
  res.json({ total, page, limit, data: pageData });
});

app.get('/api/data/:type/:username/:year', authenticateToken, (req, res) => {
  const { type, username, year } = req.params;
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  const fname = typeToFile(type);
  if(!fname) return res.status(400).json({ error: 'unknown type' });
  const data = readJSONFileSync(fname);
  const userData = data[username] || {};
  res.json(userData[year] || {});
});

app.put('/api/data/:type/:username/:year', authenticateToken, (req, res) => {
  const { type, username, year } = req.params;
  const payload = req.body || {};
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  const fname = typeToFile(type);
  if(!fname) return res.status(400).json({ error: 'unknown type' });
  const data = readJSONFileSync(fname);
  data[username] = data[username] || {};
  data[username][year] = payload;
  writeJSONFileSync(fname, data);
  res.json({ ok: true, saved: data[username][year] || null });
});

app.delete('/api/data/:type/:username/:year', authenticateToken, (req, res) => {
  const { type, username, year } = req.params;
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  const fname = typeToFile(type);
  if(!fname) return res.status(400).json({ error: 'unknown type' });
  const data = readJSONFileSync(fname);
  if(data[username] && data[username][year]) {
    delete data[username][year];
    writeJSONFileSync(fname, data);
  }
  res.json({ ok: true });
});

// export/import unchanged
app.get('/api/export', authenticateToken, (req, res) => {
  const username = req.user.username;
  const users = readJSONFileSync(FILES.users).filter(u => u.username === username).map(u => ({ username: u.username, fullname: u.fullname }));
  const taxe = readJSONFileSync(FILES.taxe);
  const tns = readJSONFileSync(FILES.tns);
  const immo = readJSONFileSync(FILES.immo);
  const out = {
    [FILES.users]: users,
    [FILES.taxe]: { [username]: taxe[username] || {} },
    [FILES.tns]: { [username]: tns[username] || {} },
    [FILES.immo]: { [username]: immo[username] || {} }
  };
  res.json(out);
});

app.post('/api/import', authenticateToken, (req, res) => {
  const body = req.body || {};
  const username = req.user.username;
  if(body[FILES.users]) {
    const usersFile = readJSONFileSync(FILES.users);
    const incoming = body[FILES.users];
    if(Array.isArray(incoming)) {
      const mine = incoming.find(u => u.username === username);
      if(mine) {
        for(const u of usersFile){
          if(u.username === username){
            if(mine.fullname) u.fullname = mine.fullname;
            break;
          }
        }
        writeJSONFileSync(FILES.users, usersFile);
      }
    }
  }
  if(body[FILES.taxe] && body[FILES.taxe][username]) {
    const file = readJSONFileSync(FILES.taxe);
    file[username] = body[FILES.taxe][username];
    writeJSONFileSync(FILES.taxe, file);
  }
  if(body[FILES.tns] && body[FILES.tns][username]) {
    const file = readJSONFileSync(FILES.tns);
    file[username] = body[FILES.tns][username];
    writeJSONFileSync(FILES.tns, file);
  }
  if(body[FILES.immo] && body[FILES.immo][username]) {
    const file = readJSONFileSync(FILES.immo);
    file[username] = body[FILES.immo][username];
    writeJSONFileSync(FILES.immo, file);
  }
  res.json({ ok: true });
});

app.use(express.static(PUBLIC_DIR));

if(require.main === module){
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;
// Admin config endpoints
app.get('/api/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cfg = await db.getConfig();
    // if null, return default or {}
    res.json(cfg || {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error', message: String(e) });
  }
});

app.put('/api/admin/config', authenticateToken, requireAdmin, async (req, res) => {
  const body = req.body || {};
  if(!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid_body' });
  try {
    await db.setConfig(body);
    res.json({ ok: true, config: body });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_write_failed', message: String(e) });
  }
});

// Data endpoints
app.get('/api/data/:type/:username', authenticateToken, async (req, res) => {
  const { type, username } = req.params;
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));
  try {
    const { total, rows } = await db.getEntriesByUserType(username, type, page, limit);
    // map rows -> { year, values }
    const data = rows.map(r => ({ year: r.year, values: r.payload }));
    res.json({ total, page, limit, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error', message: String(e) });
  }
});

app.get('/api/data/:type/:username/:year', authenticateToken, async (req, res) => {
  const { type, username, year } = req.params;
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  try {
    const entry = await db.getEntry(username, type, year);
    res.json(entry || {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error', message: String(e) });
  }
});

app.put('/api/data/:type/:username/:year', authenticateToken, async (req, res) => {
  const { type, username, year } = req.params;
  const payload = req.body || {};
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  try {
    await db.setEntry(username, type, year, payload);
    res.json({ ok: true, saved: payload });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_write_failed', message: String(e) });
  }
});

app.delete('/api/data/:type/:username/:year', authenticateToken, async (req, res) => {
  const { type, username, year } = req.params;
  if(req.user.username !== username) return res.status(403).json({ error: 'forbidden' });
  try {
    await db.deleteEntry(username, type, year);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_delete_failed', message: String(e) });
  }
});