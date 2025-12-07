// public/admin-config-table.js
// Fetch /api/config, render it as editable tables (registrationFields, forms per type, colors),
// allow add/delete/edit rows, and save updated configuration back to /api/admin/config.
//
// Usage: include this script in admin.html after the DOM (admin.html already loads admin-config.js).
// It will create a structured editor next to the existing JSON textarea.

(() => {
  const API_BASE = '/api';

  function getToken() { return sessionStorage.getItem('token') || null; }

  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
      const ct = res.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await res.json().catch(()=>null) : await res.text().catch(()=>null);
      if (!res.ok) {
        const msg = (body && (body.error || body.message)) ? (body.error || body.message) : res.statusText;
        const e = new Error(msg || `HTTP ${res.status}`);
        e.status = res.status;
        e.body = body;
        throw e;
      }
      return body;
    } catch (err) {
      throw err;
    }
  }

  // Basic DOM helpers
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k,v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    children.forEach(c => {
      if (c === null || c === undefined) return;
      node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function setStatus(msg, isError=false) {
    let s = document.getElementById('status-structured');
    if(!s) {
      s = el('span',{ id:'status-structured', style:'margin-left:12px;color:#6c757d' }, '');
      const controls = document.querySelector('.flex') || document.querySelector('#btn-save-config')?.parentNode;
      if (controls) controls.appendChild(s);
    }
    s.textContent = msg;
    s.style.color = isError ? '#e55353' : '#2dbf73';
    if (msg) setTimeout(()=>{ s.textContent=''; }, 5000);
  }

  async function ensureAdmin() {
    try {
      const me = await apiFetch('/me', { method: 'GET' });
      if(!me || me.role !== 'admin') {
        alert('Accès réservé aux administrateurs. Vous allez être redirigé.');
        location.href = '/';
        throw new Error('not_admin');
      }
      return me;
    } catch(err) {
      console.error('ensureAdmin error', err);
      alert('Erreur d\'authentification ou token manquant. Veuillez vous connecter.');
      location.href = '/';
      throw err;
    }
  }

  // Render structured editor UI (insert after textarea#config-json)
  function createStructuredEditor() {
    const ta = document.getElementById('config-json');
    if(!ta) return null;

    // container
    const wrapper = el('div',{ id:'structured-editor', style:'margin-top:12px;display:flex;gap:12px' });

    // Left column: registration fields
    const left = el('div',{ style:'flex:1;min-width:320px' },
      el('h3', {}, 'Champs d\'inscription'),
      el('div', { id:'regfields-root' })
    );

    // Middle: forms (taxe/tns/immo)
    const middle = el('div',{ style:'flex:1;min-width:420px' },
      el('h3', {}, 'Champs des formulaires'),
      // selector for type
      el('div', { class:'flex', style:'gap:8px;align-items:center;margin-bottom:8px' },
        el('label', {}, 'Type :'),
        el('select', { id:'form-type-select' })
      ),
      el('div', { id:'formfields-root' })
    );

    // Right: colors + save structured
    const right = el('div',{ style:'width:320px;flex-shrink:0' },
      el('h3', {}, 'Couleurs (full page)'),
      el('div', { style:'display:flex;flex-direction:column;gap:8px' },
        el('label', {}, 'Arrière-plan', el('br'), el('input', { type:'color', id:'color-background' })),
        el('label', {}, 'En-tête', el('br'), el('input', { type:'color', id:'color-header' })),
        el('label', {}, 'Accent', el('br'), el('input', { type:'color', id:'color-accent' })),
        el('label', {}, 'Texte', el('br'), el('input', { type:'color', id:'color-text' }))
      ),
      el('div', { style:'margin-top:12px;display:flex;gap:8px;align-items:center' },
        el('button', { id:'btn-save-structured', class:'btn' }, 'Enregistrer (structuré)'),
        el('button', { id:'btn-sync-json', class:'btn secondary' }, 'Sync JSON -> éditeur')
      )
    );

    wrapper.appendChild(left);
    wrapper.appendChild(middle);
    wrapper.appendChild(right);

    // insert after textarea
    ta.parentNode.insertBefore(wrapper, ta.nextSibling);
    return wrapper;
  }

  // Utility to build an editable table from array of objects and columns spec
  function buildEditableTable(container, rows, columns, opts = {}) {
    // columns = [{ key, label, inputType='text' }]
    container.innerHTML = '';
    const table = el('table', { style:'width:100%;border-collapse:collapse;margin-top:8px' });
    const thead = el('thead');
    const headRow = el('tr');
    columns.forEach(c => headRow.appendChild(el('th', { style:'text-align:left;padding:6px;border-bottom:1px solid #eef4f6' }, c.label)));
    headRow.appendChild(el('th', { style:'padding:6px;border-bottom:1px solid #eef4f6' }, 'Action'));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    rows.forEach((r, idx) => {
      const tr = rowToTr(r, idx);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // add row button
    const addBtn = el('button', { class:'btn secondary', type:'button', style:'margin-top:8px' }, '+ Ajouter un champ');
    addBtn.addEventListener('click', () => {
      const newRow = {};
      columns.forEach(c => newRow[c.key] = c.default || '');
      const tr = rowToTr(newRow, tbody.children.length);
      tbody.appendChild(tr);
    });

    container.appendChild(table);
    container.appendChild(addBtn);

    function rowToTr(rowObj, index) {
      const tr = el('tr');
      columns.forEach(col => {
        const td = el('td', { style:'padding:6px;border-bottom:1px solid #f1f6f8' });
        let input;
        if (col.inputType === 'checkbox') {
          input = el('input', { type:'checkbox' });
          input.checked = !!rowObj[col.key];
        } else {
          input = el('input', { type: col.inputType || 'text', style:'width:100%;' });
          input.value = rowObj[col.key] != null ? rowObj[col.key] : '';
        }
        input.dataset.key = col.key;
        td.appendChild(input);
        tr.appendChild(td);
      });

      // actions
      const tdAct = el('td', { style:'padding:6px' });
      const del = el('button', { class:'btn secondary', type:'button', style:'margin-right:6px' }, 'Suppr');
      del.addEventListener('click', () => tr.remove());
      tdAct.appendChild(del);
      tr.appendChild(tdAct);

      return tr;
    }

    // Return function to read table state as array
    return () => {
      const out = [];
      Array.from(tbody.children).forEach(tr => {
        const obj = {};
        Array.from(tr.querySelectorAll('input,select')).forEach(inp => {
          const k = inp.dataset.key;
          if (!k) return;
          if (inp.type === 'checkbox') obj[k] = inp.checked;
          else obj[k] = inp.value;
        });
        // ignore empty name rows
        if (obj.name === '' || obj.name == null) return;
        out.push(obj);
      });
      return out;
    };
  }

  // Main render function: populate the structured editor controls
  function renderStructuredEditor(config) {
    // Ensure editor exists
    const wrapper = document.getElementById('structured-editor') || createStructuredEditor();
    if(!wrapper) return;

    // Registration fields table
    const regRoot = document.getElementById('regfields-root');
    const regCols = [
      { key:'name', label:'name' },
      { key:'label', label:'label' },
      { key:'type', label:'type' },
      { key:'required', label:'required', inputType:'checkbox' }
    ];
    const readReg = buildEditableTable(regRoot, config.registrationFields || [], regCols);

    // Form types select
    const formTypes = Object.keys(config.forms || {});
    const select = document.getElementById('form-type-select');
    select.innerHTML = '';
    formTypes.forEach(t => select.appendChild(el('option', { value:t }, t)));
    // Form fields root and dynamic table
    const formRoot = document.getElementById('formfields-root');
    let readForm = () => [];
    function renderFormType(t) {
      const rows = (config.forms && config.forms[t]) ? config.forms[t] : [];
      const cols = [
        { key:'name', label:'name' },
        { key:'label', label:'label' },
        { key:'type', label:'type' }
      ];
      readForm = buildEditableTable(formRoot, rows, cols);
    }
    // initial render first type
    renderFormType(formTypes[0] || 'taxe');
    select.addEventListener('change', () => renderFormType(select.value));

    // Colors inputs
    document.getElementById('color-background').value = (config.fullPageColors && config.fullPageColors.background) || '#ffffff';
    document.getElementById('color-header').value = (config.fullPageColors && config.fullPageColors.header) || '#0d6efd';
    document.getElementById('color-accent').value = (config.fullPageColors && config.fullPageColors.accent) || '#2dbf73';
    document.getElementById('color-text').value = (config.fullPageColors && config.fullPageColors.text) || '#0b2a2b';

    // Hook save structured button
    document.getElementById('btn-save-structured').onclick = async () => {
      // collect
      const newCfg = Object.assign({}, config);
      newCfg.registrationFields = readReg();
      // forms: for each type, if currently selected read it and update; for other types try to keep original or empty
      newCfg.forms = {};
      formTypes.forEach(t => {
        if (t === select.value) {
          newCfg.forms[t] = readForm();
        } else {
          // If the table for that type is not currently visible we need to temporarily render it to read actual values
          // For simplicity, keep existing config.forms[t] if present
          newCfg.forms[t] = config.forms[t] || [];
        }
      });
      newCfg.fullPageColors = {
        background: document.getElementById('color-background').value,
        header: document.getElementById('color-header').value,
        accent: document.getElementById('color-accent').value,
        text: document.getElementById('color-text').value
      };

      // Update JSON textarea too
      const ta = document.getElementById('config-json');
      if (ta) ta.value = JSON.stringify(newCfg, null, 2);

      // send to server
      try {
        await apiFetch('/admin/config', { method:'PUT', body: JSON.stringify(newCfg) });
        setStatus('Configuration structurée enregistrée.');
      } catch (err) {
        console.error('save structured error', err);
        setStatus('Erreur enregistrement : ' + (err.message || ''), true);
      }
    };

    // Sync JSON -> editor: parse textarea and re-render editor
    document.getElementById('btn-sync-json').onclick = () => {
      const ta = document.getElementById('config-json');
      try {
        const parsed = JSON.parse(ta.value);
        // mutate config and re-render
        config = parsed;
        renderStructuredEditor(config);
        setStatus('Editeur synchronisé depuis JSON.');
      } catch (err) {
        setStatus('JSON invalide : ' + err.message, true);
      }
    };
  }

  // initial load: ensure admin, then fetch config and render
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await ensureAdmin();
      const cfg = await apiFetch('/config', { method: 'GET' });
      // Fill textarea if present
      const ta = document.getElementById('config-json');
      if (ta) ta.value = JSON.stringify(cfg, null, 2);
      renderStructuredEditor(cfg);
    } catch (err) {
      // ensureAdmin will redirect; other errors logged
      console.error('init structured editor error', err);
    }
  });

})();