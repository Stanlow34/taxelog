// www/app.js - front-end with add/delete year, "full" page, print-as-PDF support and admin users list
const API_BASE = '/api';

// --- helper fetch wrappers (robust) ---
async function apiFetch(path, opts = {}) {
  const token = currentToken();
  const headers = Object.assign({}, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  headers['Cache-Control'] = headers['Cache-Control'] || 'no-store';

  try {
    const res = await fetch(`${API_BASE}${path}`, Object.assign({}, opts, {
      headers,
      cache: 'no-store'
    }));

    const contentType = res.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('application/json')) {
      try {
        body = await res.json();
      } catch (e) {
        body = { __raw: await res.text() };
      }
    } else {
      const txt = await res.text();
      if (txt) body = { __raw: txt };
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        const reason = (body && body.reason) ? ` (${body.reason})` : '';
        clearSession();
        alert('Session expirée ou non autorisée. Veuillez vous reconnecter.' + reason);
        location.hash = 'auth';
        const err = new Error('Unauthorized');
        err.status = res.status;
        err.body = body;
        throw err;
      }
      const err = new Error(body && (body.error || body.message) ? `${body.error || ''} ${body.message || ''}`.trim() : (res.statusText || 'HTTP error'));
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return body === null ? {} : body;
  } catch (err) {
    console.error('apiFetch error', err);
    throw err;
  }
}

// --- session helpers ---
function setSession(user, token) {
  sessionStorage.setItem('currentUser', JSON.stringify(user));
  sessionStorage.setItem('token', token);
}
function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem('currentUser') || 'null');
  } catch (e) {
    return null;
  }
}
function currentToken() {
  return sessionStorage.getItem('token') || null;
}
function clearSession() {
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('token');
}

// --- routing / view management ---
const appEl = document.getElementById('app');
const templates = {};
document.querySelectorAll('template').forEach(t => templates[t.id.replace('view-','')] = t);

function renderTemplate(name) {
  appEl.innerHTML = '';
  const tpl = templates[name];
  if(!tpl) {
    appEl.innerHTML = `<section class="card"><h2>Page non trouvée</h2></section>`;
    return;
  }
  appEl.appendChild(tpl.content.cloneNode(true));
}

function navigate(){
  const raw = location.hash.replace('#','') || 'home';
  // special route: full/<type>
  if(raw.startsWith('full/')) {
    renderTemplate('full');
    attachFullHandlers(raw.split('/')[1]);
    updateHeaderUserArea();
    return;
  }
  // otherwise normal view name
  const viewName = raw;
  renderTemplate(viewName);
  updateHeaderUserArea();
  if(viewName === 'auth') attachAuthHandlers();
  if(viewName === 'dashboard') attachDashboardHandlers();
  if(viewName === 'admin') attachAdminHandlers();
}
window.addEventListener('hashchange', navigate);
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('copyright-year').textContent = new Date().getFullYear();
  navigate();
});

// --- header area ---
function updateHeaderUserArea(){
  const container = document.getElementById('user-actions');
  const user = currentUser();
  container.innerHTML = '';
  if(user){
    const el = document.createElement('div');
    el.innerHTML = `<span style="margin-right:8px">Bonjour, <strong>${escapeHtml(user.fullname)}</strong></span>
                    <a href="#dashboard" class="btn outline">Mon tableau de bord</a>`;
    container.appendChild(el);

    // If admin, also show a small admin button next to the dashboard link in header
    if(user.role === 'admin'){
      const adminLink = document.createElement('a');
      adminLink.href = '#admin';
      adminLink.className = 'btn danger';
      adminLink.style.marginLeft = '8px';
      adminLink.textContent = 'Admin';
      container.appendChild(adminLink);
    }
  } else {
    container.innerHTML = `<a href="#auth" class="btn">Se connecter</a>`;
  }
}
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

// --- auth handlers (unchanged) ---
function attachAuthHandlers(){
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const form = new FormData(loginForm);
      const login = form.get('login').trim();
      const password = form.get('password');
      try {
        const res = await apiFetch('/login', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({login, password})
        });
        setSession({ username: res.username, fullname: res.fullname, role: res.role }, res.token);
        location.hash = 'dashboard';
      } catch (err) {
        console.error('login error', err);
        alert('Identifiant ou mot de passe invalide.');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      const form = new FormData(registerForm);
      const fullname = form.get('fullname').trim();
      const username = form.get('username').trim();
      const password = form.get('password');
      if(!fullname || !username || !password) return alert('Veuillez remplir tous les champs.');
      try {
        const res = await apiFetch('/register', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({fullname, username, password})
        });
        setSession({ username: res.username, fullname: res.fullname, role: res.role }, res.token);
        location.hash = 'dashboard';
      } catch(err) {
        console.error('register error', err);
        alert('Erreur lors de l\'inscription : ' + (err.message || err));
      }
    });
  }
}

// --- dashboard handlers ---
function attachDashboardHandlers(){
  const user = currentUser();
  if(!user) { location.hash = 'auth'; return; }
  const welcomeEl = document.getElementById('welcome-line');
  if (welcomeEl) welcomeEl.textContent = `Connecté en tant que ${user.fullname} (${user.username})`;

  const exportBtn = document.getElementById('export-data');
  if(exportBtn) exportBtn.addEventListener('click', async () => {
    try {
      const all = await apiFetch('/export', { method: 'GET' });
      const blob = new Blob([JSON.stringify(all,null,2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `monsimulateur_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch(err) {
      console.error('export error', err);
      alert('Erreur export : ' + err.message);
    }
  });

  const importInput = document.getElementById('import-file');
  if(importInput){
    importInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if(!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        await apiFetch('/import', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(data)
        });
        alert('Import terminé.');
        renderTemplate('dashboard');
        attachDashboardHandlers();
      } catch(err) {
        console.error('import error', err);
        alert('Erreur import : ' + (err.message || err));
      }
      e.target.value = '';
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', () => {
      clearSession();
      location.hash = 'auth';
    });
  }

  // zones
  setupZone('taxe', 'taxe', ['revenu','revenu_conjoint','nb_enfants','nb_charge']);
  setupZone('tns', 'tns', ['revenu','charges','foncier','madelin']);
  setupZone('immo', 'immo', ['revenu','charges','dispositif','deficit']);

  document.querySelectorAll('.zone-year-title').forEach(el => {
    const zone = el.dataset.zone;
    if(zone) el.textContent = new Date().getFullYear();
  });

  // attach add/delete year buttons (delegated)
  document.querySelectorAll('button[data-action="add-year"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const zone = btn.dataset.zone;
      const year = prompt('Année à ajouter (ex: 2026)', String(new Date().getFullYear()+1));
      if(!year) return;
      const username = currentUser().username;
      try {
        // create an empty entry for that year
        await apiFetch(`/data/${zone}/${encodeURIComponent(username)}/${encodeURIComponent(year)}`, {
          method: 'PUT',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({})
        });
        alert(`Année ${year} ajoutée.`);
        // refresh the form select and recap
        const form = document.querySelector(`form[data-zone="${zone}"]`);
        populateFormForYearServer(zone, getFieldsForZone(zone), form, year);
        renderRecapServer(zone, getFieldsForZone(zone), document.querySelector(`.zone-recap[data-zone="${zone}"] .recap-table`), generateYears(4));
      } catch(err) {
        console.error('add-year error', err);
        alert('Erreur lors de l\'ajout de l\'année');
      }
    });
  });

  document.querySelectorAll('button[data-action="delete-year"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const zone = btn.dataset.zone;
      const year = prompt('Année à supprimer (ex: 2025)', String(new Date().getFullYear()));
      if(!year) return;
      if(!confirm(`Voulez-vous vraiment supprimer l'année ${year} pour ${zone} ? Cette opération est irréversible.`)) return;
      const username = currentUser().username;
      try {
        await apiFetch(`/data/${zone}/${encodeURIComponent(username)}/${encodeURIComponent(year)}`, { method: 'DELETE' });
        alert(`Année ${year} supprimée.`);
        // refresh recap
        renderRecapServer(zone, getFieldsForZone(zone), document.querySelector(`.zone-recap[data-zone="${zone}"] .recap-table`), generateYears(4));
      } catch(err) {
        console.error('delete-year error', err);
        alert('Erreur lors de la suppression de l\'année');
      }
    });
  });
}

// helper to get fields per zone
function getFieldsForZone(zone){
  if(zone === 'taxe') return ['revenu','revenu_conjoint','nb_enfants','nb_charge'];
  if(zone === 'tns') return ['revenu','charges','foncier','madelin'];
  if(zone === 'immo') return ['revenu','charges','dispositif','deficit'];
  return [];
}

/**
 * zoneId: 'taxe'|'tns'|'immo'
 * typeName: 'taxe'|'tns'|'immo'
 * fields: array of field names
 */
function setupZone(zoneId, typeName, fields){
  const user = currentUser();
  if(!user){ location.hash = 'auth'; return; }

  const form = document.querySelector(`form[data-zone="${zoneId}"]`);
  if(!form) return;
  const yearSelect = form.querySelector('.year-select');
  const recapRoot = document.querySelector(`.zone-recap[data-zone="${zoneId}"] .recap-table`);

  // Build default years (N..N-3) but the add-year can add custom years
  const years = generateYears(4);
  // ensure year select contains the default years
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

  // update zone title year
  const zoneTitleSpan = document.querySelector(`#zone-${zoneId} .zone-title .zone-year-title`);
  if(zoneTitleSpan) zoneTitleSpan.textContent = years[0];

  yearSelect.addEventListener('change', async () => {
    const y = yearSelect.value;
    if(zoneTitleSpan) zoneTitleSpan.textContent = y;
    await populateFormForYearServer(typeName, fields, form, y);
  });

  // initial populate & render recap
  populateFormForYearServer(typeName, fields, form, years[0]).catch(console.error);
  renderRecapServer(typeName, fields, recapRoot, years).catch(console.error);

  // form submit handler
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(form);
    const year = formData.get('year');
    const payload = {};
    fields.forEach(f => payload[f] = formData.get(f) || '');
    const username = currentUser().username;
    try {
      const existing = await apiFetch(`/data/${typeName}/${encodeURIComponent(username)}/${encodeURIComponent(year)}`, { method: 'GET' });
      const exists = existing && Object.keys(existing).length > 0;
      if(exists){
        const ok = confirm(`Souhaitez-vous modifier les données de l'année ${year} ?`);
        if(!ok) return;
      }
      const res = await apiFetch(`/data/${typeName}/${encodeURIComponent(username)}/${encodeURIComponent(year)}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      console.log('PUT response:', res);
      if(res && res.saved) {
        alert('Données enregistrées (confirmé serveur).');
      } else if(res && res.ok) {
        alert('Données enregistrées.');
      } else {
        console.warn('Réponse inattendue du serveur:', res);
        alert('Réponse inattendue du serveur. Voir console.');
      }
      const yrs = generateYears(4);
      await renderRecapServer(typeName, fields, recapRoot, yrs);
    } catch(err){
      if(err && err.status && err.body) {
        console.error('API error details', err.status, err.body);
      } else {
        console.error('submit error', err);
      }
      if(err.message !== 'Unauthorized') alert('Erreur lors de l\'enregistrement : ' + (err.message || err));
    }
  });
}

// populate single-year form fields
async function populateFormForYearServer(typeName, fields, formEl, year){
  const user = currentUser();
  if(!user){ location.hash = 'auth'; return; }
  const username = user.username;
  try {
    const obj = await apiFetch(`/data/${typeName}/${encodeURIComponent(username)}/${encodeURIComponent(year)}`, { method: 'GET' });
    fields.forEach(f => {
      const input = formEl.querySelector(`[name="${f}"]`);
      if(input) input.value = obj[f] || '';
    });
    const select = formEl.querySelector('[name="year"]');
    if(select) select.value = year;
  } catch(err){
    if(err.message !== 'Unauthorized') console.error('populate error', err);
  }
}

// render recap as columns by year (already implemented)
async function renderRecapServer(typeName, fields, rootEl, years){
  const user = currentUser();
  if(!user){ rootEl.innerHTML = '<div style="color:#a00">Non connecté</div>'; return; }
  const username = user.username;
  rootEl.innerHTML = '';

  try {
    const userData = await apiFetch(`/data/${typeName}/${encodeURIComponent(username)}`, { method: 'GET' });
    const map = {};
    if(userData && Array.isArray(userData.data)) {
      userData.data.forEach(item => { map[item.year] = item.values; });
    }

    const cols = document.createElement('div');
    cols.className = 'recap-columns';

    years.forEach(y => {
      const col = document.createElement('div');
      col.className = 'recap-col';
      const h = document.createElement('h5');
      h.textContent = y;
      h.className = 'recap-year';
      col.appendChild(h);

      const yearValues = map[y] || null;
      fields.forEach(f => {
        const item = document.createElement('div');
        item.className = 'recap-item';
        const label = document.createElement('div');
        label.className = 'recap-field-label';
        label.textContent = fieldLabel(f);
        const value = document.createElement('div');
        value.className = 'recap-field-value';
        let v = '—';
        if(yearValues && typeof yearValues[f] !== 'undefined' && yearValues[f] !== null && yearValues[f] !== '') v = String(yearValues[f]);
        value.textContent = v;
        item.appendChild(label);
        item.appendChild(value);
        col.appendChild(item);
      });

      cols.appendChild(col);
    });

    rootEl.appendChild(cols);
  } catch(err){
    if(err.message !== 'Unauthorized') {
      console.error('renderRecapServer error', err);
      rootEl.innerHTML = '<div style="color:#a00">Erreur de chargement</div>';
    }
  }
}

// --- Admin page handler: populate admin-users-list with username, fullname, role and allow role update ---
async function attachAdminHandlers(){
  const user = currentUser();
  if(!user) { location.hash = 'auth'; return; }
  if(user.role !== 'admin') {
    alert('Accès refusé : administrateur requis');
    location.hash = 'dashboard';
    return;
  }

  const listRoot = document.getElementById('admin-users-list');
  if(!listRoot) return;
  listRoot.innerHTML = 'Chargement des utilisateurs…';

  try {
    const res = await apiFetch('/admin/users', { method: 'GET' });
    const users = Array.isArray(res.data) ? res.data : [];

    // build table
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eef4f6">username</th><th style="text-align:left;padding:8px;border-bottom:1px solid #eef4f6">fullname</th><th style="text-align:left;padding:8px;border-bottom:1px solid #eef4f6">role</th><th style="padding:8px;border-bottom:1px solid #eef4f6">action</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #f1f6f8';

      const tdUser = document.createElement('td');
      tdUser.style.padding = '8px';
      tdUser.textContent = u.username || '';

      const tdFull = document.createElement('td');
      tdFull.style.padding = '8px';
      tdFull.textContent = u.fullname || '';

      const tdRole = document.createElement('td');
      tdRole.style.padding = '8px';
      const select = document.createElement('select');
      ['visuel','editeur','admin'].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        if(u.role === r) opt.selected = true;
        select.appendChild(opt);
      });
      tdRole.appendChild(select);

      const tdAction = document.createElement('td');
      tdAction.style.padding = '8px';
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = 'Mettre à jour';
      btn.addEventListener('click', async () => {
        const newRole = select.value;
        if(!confirm(`Mettre à jour le rôle de ${u.username} en "${newRole}" ?`)) return;
        try {
          await apiFetch(`/admin/users/${encodeURIComponent(u.username)}/role`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ role: newRole })
          });
          alert('Rôle mis à jour.');
          // refresh list
          attachAdminHandlers();
        } catch(err) {
          console.error('update role error', err);
          alert('Erreur lors de la mise à jour du rôle : ' + (err.message || ''));
        }
      });
      tdAction.appendChild(btn);

      tr.appendChild(tdUser);
      tr.appendChild(tdFull);
      tr.appendChild(tdRole);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    listRoot.innerHTML = '';
    listRoot.appendChild(table);
  } catch(err){
    console.error('load admin users error', err);
    listRoot.innerHTML = '<div style="color:#a00">Impossible de charger la liste des utilisateurs.</div>';
  }
}

// --- FULL page handlers (display N+3 .. N-3, selection, print) ---
function attachFullHandlers(typeName){
  const user = currentUser();
  if(!user) { location.hash = 'auth'; return; }
  const title = document.getElementById('full-title');
  const subtitle = document.getElementById('full-subtitle');
  title.textContent = `Données : ${typeName.toUpperCase()}`;
  subtitle.textContent = `Utilisateur : ${user.fullname} (${user.username}) — Type : ${typeName}`;

  const yearsSelect = document.getElementById('years-select');
  // range N+3 ... N-3
  const cur = new Date().getFullYear();
  const years = [];
  for(let i=3;i>=-3;i--) years.push(String(cur + i)); // N+3 .. N-3
  yearsSelect.innerHTML = years.map(y => `<option value="${y}" selected>${y}</option>`).join('');

  const fullTable = document.getElementById('full-table');
  const refreshBtn = document.getElementById('refresh-full');
  const printBtn = document.getElementById('print-pdf');

  async function refreshFull() {
    const selected = Array.from(yearsSelect.selectedOptions).map(o => o.value);
    // fetch all data for user/type
    const userData = await apiFetch(`/data/${typeName}/${encodeURIComponent(user.username)}`, { method: 'GET' });
    const map = {};
    if(userData && Array.isArray(userData.data)) userData.data.forEach(it => map[it.year] = it.values);

    // build table: columns = years selected, rows = fields
    const fields = getFieldsForZone(typeName);
    const table = document.createElement('div');
    table.className = 'full-table';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    trHead.appendChild(Object.assign(document.createElement('th'), { textContent: 'Champ' }));
    selected.forEach(y => {
      const th = document.createElement('th');
      th.textContent = y;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    fields.forEach(f => {
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.textContent = fieldLabel(f);
      tr.appendChild(tdLabel);
      selected.forEach(y => {
        const td = document.createElement('td');
        const v = map[y] && map[y][f] ? String(map[y][f]) : '—';
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    table.appendChild(tbl);

    fullTable.innerHTML = '';
    fullTable.appendChild(table);
  }

  refreshBtn.addEventListener('click', () => refreshFull());
  printBtn.addEventListener('click', () => {
    // create a printable window with the current table
    const selected = Array.from(yearsSelect.selectedOptions).map(o => o.value);
    const content = document.getElementById('full-table').innerHTML;
    const popup = window.open('', '_blank', 'width=900,height=800');
    if(!popup) { alert('Impossible d\'ouvrir la fenêtre d\'impression (pop-up bloqué).'); return; }
    popup.document.write(`<html><head><title>Export ${typeName}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:8px}
      th{background:#f6fbfb}
      h2{color:#0d6efd}
      </style></head><body>`);
    popup.document.write(`<h2>Données ${typeName.toUpperCase()}</h2>`);
    popup.document.write(`<p>Utilisateur : ${escapeHtml(user.fullname)} (${escapeHtml(user.username)})</p>`);
    popup.document.write(content);
    popup.document.write('</body></html>');
    popup.document.close();
    // wait before calling print
    setTimeout(() => { popup.print(); }, 400);
  });

  // initial load
  refreshFull().catch(err => { console.error('refreshFull error', err); });
}

// --- helpers ---
function fieldLabel(key){
  const map = {
    'revenu':'Revenu',
    'revenu_conjoint':'Revenu conjoint',
    'nb_enfants':'Nb enfants',
    'nb_charge':'Nb personnes à charge',
    'charges':'Charges',
    'foncier':'Foncier',
    'madelin':'Madelin',
    'dispositif':'Dispositif',
    'deficit':'Déficit antérieur'
  };
  return map[key] || key;
}

function generateYears(count){
  const cur = new Date().getFullYear();
  const years = [];
  for(let i=0;i<count;i++) years.push(String(cur - i));
  return years;
}