
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
