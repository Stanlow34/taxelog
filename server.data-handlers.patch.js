// server.data-handlers.patch.js
// Remplacez les handlers existants (ceux qui utilisaient readJSONFileSync / writeJSONFileSync)
// par les versions ci‑dessous. Dans server.js :
// 1) ajoutez en haut : const db = require('./db');
// 2) remplacez les endpoints admin/config et /api/data/* par les suivants.

const db = require('./db');

// Admin config
app.get('/api/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cfg = await db.getConfig();
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