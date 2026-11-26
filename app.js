/* Dashboard for ESA, SDE, BM and Super Admin */
const T = store.get();
const RN = { esa: 'ESA', sde: 'SDE', bm: 'BM', admin: 'Super Admin' };
const STATUS = ['Pending', 'Approved', 'Rejected'];
let me, O = {}, tab = '', F = {}, page = 0, rows = [], picked = new Set(), path = [], groups = [], notes = [], lastNote = null, view = 0;

const call = (fn, args = {}, quiet) => api(fn, { t: T, ...args }, quiet);
const admin = (action, d = {}) => call('api_admin', { p_action: action, d });
const fd = d => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB') : '';
const ft = d => d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '';
const badge = x => `<span class="bd ${x.status}">${x.status}</span>${x.urgent ? ' <span class="bd urg">Urgent</span>' : ''}`;
const age = x => { const d = Math.floor((Date.now() - new Date(x.submitted_at)) / 864e5); return d < 1 ? 'today' : d + (d === 1 ? ' day' : ' days') + ' ago'; };
const empty = m => `<p class="mu">${m}</p>`;
const options = (list, value, selected, label) => list.map(x => `<option value="${esc(value(x))}" ${value(x) === selected ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
const table = (heads, body) => `<div class="tw"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
const btn = (act, label, id = '', cls = '') => `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;

/* ---------- dialogs ---------- */
function modal(html) {
  const o = document.createElement('div');
  o.className = 'ov';
  o.innerHTML = `<div class="nu card md" role="dialog" aria-modal="true">${html}<div class="row"><button type="button" class="btn" data-act="close">Close</button></div></div>`;
  document.body.append(o);
}
function ask(title, { input, type, value = '', ok = 'Confirm' } = {}) {
  return new Promise(done => {
    const o = document.createElement('div');
    o.className = 'ov';
    const control = !input ? '' : type === 'password'
      ? '<input id="ai" type="password" autocomplete="new-password">'
      : `<textarea id="ai" rows="3" maxlength="500">${esc(value)}</textarea>`;
    o.innerHTML = `<div class="nu card md" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${control}<div class="row"><button type="button" class="btn" id="no">Cancel</button><button type="button" class="btn pri" id="yes">${ok}</button></div></div>`;
    document.body.append(o);
    const end = v => { o.remove(); done(v); };
    o.querySelector('#no').onclick = () => end(null);
    o.querySelector('#yes').onclick = () => {
      if (!input) return end(true);
      const v = o.querySelector('#ai').value.trim();
      if (!v) return toast('This field is required', true);
      end(v);
    };
    o.querySelector('#ai')?.focus();
  });
}

/* ---------- layout ---------- */
function tabsFor() {
  if (me.role === 'esa') return [['home', 'My Calls'], ['profile', 'Profile']];
  if (me.role === 'sde') return [['calls', 'Cancel Calls'], ['companies', 'Select Companies'], ['password', 'Password']];
  const t = [['records', 'Records'], ['drill', 'Drilldown'], ['dir', 'Companies & L-Codes']];
  if (me.role === 'admin') t.push(['manage', 'Manage']);
  return [...t, ['password', 'Password']];
}
function shell() {
  const label = me.role === 'esa' ? `${me.company} · ${me.lcode}` : `${me.name} (${RN[me.role]})`;
  $('#app').innerHTML = `<div class="wrap">
    <header class="nu bar"><div class="brand"><img src="icon.svg" alt=""><h1>Cancel Call Management</h1></div>
    <div class="acts"><span class="chip">${esc(label)}</span><button class="btn sm bell" data-act="notes" id="bell">🔔 Alerts</button>${btn('logout', 'Logout')}</div></header>
    <nav class="tabs">${tabsFor().map(([k, l]) => `<button class="btn ${k === tab ? 'on' : ''}" data-act="tab" data-id="${k}">${l}</button>`).join('')}</nav>
    <main id="main"></main></div>`;
  drawBell();
}
async function go(next) {
  tab = next; page = 0; F = {}; path = []; picked.clear(); view++;
  history.replaceState(null, '', '#' + tab);
  shell();
  await VIEWS[tab]();
}

/* ---------- shared: filters, list, pager ---------- */
const sel = (id, label, inner) => `<div><label class="l" for="f_${id}">${label}</label><select id="f_${id}" data-f="${id}"><option value="">All</option>${inner}</select></div>`;
const inp = (id, label, type = 'text') => `<div><label class="l" for="f_${id}">${label}</label><input id="f_${id}" data-f="${id}" type="${type}" value="${esc(F[id])}"></div>`;
function filterCard() {
  return `<form class="nu card" id="filters"><h2>Filters</h2><div class="frm">
    ${inp('q', 'Search ticket, company, L-Code, remarks')}${inp('from', 'Created from', 'date')}${inp('to', 'Created to', 'date')}
    ${sel('company', 'Company', options(O.companies, x => x.id, F.company, x => x.name))}
    ${sel('esa', 'ESA (L-Code)', options(O.lcodes, x => x.id, F.esa, x => x.lcode + ' · ' + x.company))}
    ${sel('sde', 'SDE', options(O.staff.filter(s => s.role === 'sde'), x => x.id, F.sde, x => x.user_id))}
    ${sel('status', 'Status', options(STATUS, x => x, F.status, x => x))}
  </div><button class="btn pri">Apply Filters</button> ${btn('reset', 'Reset')}</form>`;
}
const readFilters = () => document.querySelectorAll('[data-f]').forEach(e => F[e.dataset.f] = e.value.trim());
const pager = (total, size) => {
  const n = Math.max(1, Math.ceil(total / size));
  return `<div class="row" style="margin:14px 0 0"><button class="btn sm" data-act="page" data-id="${page - 1}" ${page ? '' : 'disabled'}>Previous</button><span class="mu">Page ${page + 1} of ${n} · ${total} records</span><button class="btn sm" data-act="page" data-id="${page + 1}" ${page + 1 < n ? '' : 'disabled'}>Next</button></div>`;
};
const statCards = (c, clickable) => [['', 'Total Calls', c.all], ...STATUS.map(s => [s, s + ' Calls', c[s]])]
  .map(([k, l, n]) => clickable
    ? `<button class="nu stat ${k} ${(F.status || '') === k ? 'sel' : ''}" data-act="status" data-id="${k}"><b>${n}</b>${l}</button>`
    : `<div class="nu stat ${k}"><b>${n}</b>${l}</div>`).join('');

/* Reload the current list (after paging, filtering or new data) */
async function load() {
  if (!['home', 'calls', 'records'].includes(tab)) return;
  const v = view, size = tab === 'calls' ? 20 : 25;
  const r = await call('api_calls', { f: F, p_limit: size, p_offset: page * size });
  if (!r || v !== view || !$('#list')) return;
  if (!r.rows.length && page) { page--; return load(); }
  rows = r.rows;
  picked = new Set([...picked].filter(id => rows.some(x => x.id === id && x.status === 'Pending')));
  $('#stats').innerHTML = statCards(r.counts, tab !== 'records');
  $('#list').innerHTML = (rows.length ? LISTS[tab]() : empty(tab === 'calls' && !O.mine.length ? 'Select companies first. Their Cancel Calls will appear here.' : 'No calls found.')) + pager(r.total, size);
  drawBulk();
}

const LISTS = {
  home: () => table(['Ticket', 'Customer', 'Created', 'Remarks', 'Status', 'SDE Response', ''], rows.map(x => `<tr><td>${esc(x.ticket_no)}</td><td>${esc(x.customer_name || '—')}</td><td>${fd(x.created_date)}<div class="mu small">sent ${age(x)}</div></td><td>${esc(x.remarks)}</td><td>${badge(x)}</td><td>${esc(x.response_remark || '—')}<div class="mu small">${ft(x.responded_at)}</div></td><td>${x.status === 'Pending' ? btn('withdraw', 'Withdraw', x.id, 'no') : x.status === 'Rejected' ? btn('resubmit', 'Resubmit', x.id) : ''}</td></tr>`).join('')),
  calls: () => rows.map(x => `<div class="cc"><div class="row">
    <label class="acts">${x.status === 'Pending' ? `<input type="checkbox" data-pick="${x.id}" ${picked.has(x.id) ? 'checked' : ''} aria-label="Select ${esc(x.ticket_no)}">` : ''}<b>${esc(x.ticket_no)}</b></label><span>${badge(x)}</span></div>
    <div class="kv"><span>Company</span><span>${esc(x.company)} (${esc(x.lcode)})</span><span>Customer</span><span>${esc(x.customer_name || '—')}</span><span>Created Date</span><span>${fd(x.created_date)}</span><span>Submitted</span><span>${ft(x.submitted_at)} · ${age(x)}</span><span>ESA Remarks</span><span>${esc(x.remarks)}</span>${x.response_remark ? `<span>Response</span><span>${esc(x.response_remark)} — ${esc(x.sde)}</span>` : ''}</div>
    ${x.status === 'Pending' ? btn('approve', 'Approve', x.id, 'ok') + ' ' + btn('reject', 'Reject', x.id, 'no') : ''}</div>`).join(''),
  records: () => table(['Ticket', 'Customer', 'Created', 'Company', 'L-Code', 'SDE', 'Status', 'Remarks'], rows.map(x => `<tr class="cl" tabindex="0" data-act="detail" data-id="${x.id}"><td>${esc(x.ticket_no)}</td><td>${esc(x.customer_name || '—')}</td><td>${fd(x.created_date)}</td><td>${esc(x.company)}</td><td>${esc(x.lcode)}</td><td>${esc(x.sde || '—')}</td><td>${badge(x)}</td><td>${esc(x.remarks)}</td></tr>`).join(''))
};
function detail(id) {
  const x = rows.find(r => r.id === id);
  if (!x) return;
  const kv = [['Customer', x.customer_name || '—'], ['Company', x.company], ['L-Code', x.lcode], ['Created Date', fd(x.created_date)], ['Submitted At', ft(x.submitted_at)], ['ESA Remarks', x.remarks], ['SDE', x.sde || '—'], ['SDE Response', x.response_remark || '—'], ['Responded At', ft(x.responded_at) || '—']];
  modal(`<h2>Ticket ${esc(x.ticket_no)}</h2><div class="kv"><span>Status</span><span>${badge(x)}</span>${kv.map(([k, v]) => `<span>${k}</span><span>${esc(v)}</span>`).join('')}</div>`);
}

/* ---------- export ---------- */
async function exportData(type) {
  toast('Preparing export…');
  let all = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await call('api_calls', { f: F, p_limit: 1000, p_offset: offset });
    if (!r) return;
    all = all.concat(r.rows);
    if (r.rows.length < 1000) break;
  }
  if (!all.length) return toast('No records to export', true);
  const out = all.map(x => ({ 'Ticket Number': x.ticket_no, 'Customer Name': x.customer_name || '', 'Created Date': x.created_date, 'Company Name': x.company, 'L-Code': x.lcode, 'SDE': x.sde || '', 'Status': x.status, 'Urgent': x.urgent ? 'Yes' : 'No', 'ESA Remarks': x.remarks, 'SDE Response': x.response_remark || '', 'Responded At': ft(x.responded_at), 'Submitted At': ft(x.submitted_at) }));
  const name = 'cancel_calls_' + new Date().toLocaleDateString('en-CA');
  if (type === 'xlsx') {
    if (!window.XLSX) await new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = s.onerror = res;
      document.head.append(s);
    });
    if (!window.XLSX) return toast('Could not load Excel export. Use CSV.', true);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Cancel Calls');
    XLSX.writeFile(wb, name + '.xlsx');
  } else {
    const keys = Object.keys(out[0]);
    // A leading = + - @ would run as a formula in Excel
    const cell = v => '"' + String(v).replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""') + '"';
    const csv = [keys.map(cell).join(','), ...out.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = name + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  toast('Export complete: ' + all.length + ' records');
}

/* ---------- ticket date ---------- */
function extractDate(ticketNumber, createdDate) {
  // User already entered Created Date
  if (createdDate && createdDate.trim() !== "") {
    return createdDate;
  }

  // If Created Date is empty, extract from Ticket Number
  if (!ticketNumber || ticketNumber.length < 7) {
    return "";
  }

  const year = "20" + ticketNumber.substring(1, 3);
  const month = ticketNumber.substring(3, 5);
  const day = ticketNumber.substring(5, 7);

  // Validate date
  const date = new Date(`${year}-${month}-${day}T00:00:00`);

  if (
    date.getFullYear() != year ||
    date.getMonth() + 1 != Number(month) ||
    date.getDate() != Number(day)
  ) {
    return "";
  }

  return `${day}/${month}/${year}`;
}

function toIsoDate(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parts = d.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  const dashParts = d.split('-');
  if (dashParts.length === 3 && dashParts[0].length <= 2) return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  return null;
}

const ticketDate = (t, c) => extractDate(t, c);

/* ---------- views ---------- */
const VIEWS = {
  async home() {
    $('#main').innerHTML = `<div id="stats" class="grid"></div>
      <form class="nu card" id="newcall"><h2>New Cancel Call</h2><div class="frm">
        <div><label class="l">Company Name</label><input value="${esc(me.company)}" readonly></div>
        <div><label class="l" for="tk">Ticket Number *</label><input id="tk" required maxlength="40" autocomplete="off"></div>
        <div><label class="l" for="cd">Created Date</label><input id="cd" placeholder="DD/MM/YYYY" maxlength="10"></div>
        <div><label class="l" for="cn">Customer Name</label><input id="cn" maxlength="100" autocomplete="off" placeholder="Customer Name"></div>
        <div class="full"><label class="l" for="rm">Remarks *</label><textarea id="rm" rows="3" required maxlength="500"></textarea></div>
      </div><label class="ck plain"><input type="checkbox" id="urg"> Mark as urgent</label><button class="btn pri">Submit Cancel Call</button></form>
      <div class="nu card"><div class="row"><h2>My Cancel Calls</h2><input id="search" placeholder="Search…" aria-label="Search" style="max-width:260px"></div><div id="list"></div></div>`;
    await load();
  },
  async profile() {
    const f = (id, label, value, attrs = '') => `<div><label class="l" for="${id}">${label}</label><input id="${id}" value="${esc(value)}" ${attrs}></div>`;
    $('#main').innerHTML = `<form class="nu card" id="profile"><h2>My Profile</h2><p class="mu">Your primary L-Code is your login. After changing it, login with the new L-Code.</p><div class="frm">
      ${f('p_lcode', 'Primary L-Code', me.lcode, 'required maxlength="30"')}${f('p_company', 'Company Name', me.company, 'required maxlength="100"')}
      ${f('p_contact', 'Contact person', me.contact, 'maxlength="60"')}${f('p_phone', 'Phone', me.phone, 'type="tel" maxlength="20"')}
      </div><button class="btn pri">Save Changes</button></form>`;
  },
  async calls() {
    $('#main').innerHTML = `<div id="stats" class="grid"></div><div class="nu card"><div class="row"><h2>Cancel Calls</h2><input id="search" placeholder="Search…" aria-label="Search" style="max-width:260px"></div>
      <div class="row" id="bulk"></div><div id="list"></div></div>`;
    await load();
  },
  async records() {
    $('#main').innerHTML = filterCard() + `<div id="stats" class="grid"></div><div class="nu card"><h2>Last 14 days (submitted)</h2><div id="trend" class="chart"></div></div>
      <div class="nu card"><div class="row"><h2>Cancel Call Records</h2><div>${btn('export', 'Export CSV', 'csv')} ${btn('export', 'Export Excel', 'xlsx')}</div></div><div id="list"></div></div>`;
    await Promise.all([load(), drawTrend()]);
  },
  async drill() {
    $('#main').innerHTML = filterCard() + '<div class="nu card"><h2>Drilldown</h2><div id="crumbs" class="acts" style="margin-bottom:14px"></div><div id="list"></div></div>';
    await loadDrill();
  },
  async dir() {
    $('#main').innerHTML = `<div class="nu card"><h2>Company Names and L-Codes</h2>${table(['Company Name', 'L-Codes', 'Count'], O.companies.map(c => {
      const l = O.lcodes.filter(x => x.company_id === c.id);
      return `<tr><td>${esc(c.name)}</td><td>${l.map(x => esc(x.lcode + (x.active ? '' : ' (inactive)') + (x.phone ? ` · ${x.contact || ''} ${x.phone}` : ''))).join('<br>') || '—'}</td><td>${l.length}</td></tr>`;
    }).join(''))}</div>`;
  },
  async companies() {
    $('#main').innerHTML = `<div class="nu card"><div class="row"><h2>Select Companies</h2><span class="chip" id="cnt"></span></div><input id="cq" placeholder="Search company…" aria-label="Search company"><div id="list"></div></div>`;
    drawCompanies();
  },
  async password() {
    $('#main').innerHTML = `<form class="nu card" id="pwform" style="max-width:480px"><h2>Change Password</h2>
      ${[['old', 'Current password', 'current-password'], ['new', 'New password (6+ characters)', 'new-password'], ['new2', 'Confirm new password', 'new-password']].map(([i, l, a]) => `<label class="l" for="${i}">${l}</label><input id="${i}" type="password" required autocomplete="${a}" style="margin-bottom:14px">`).join('')}
      <button class="btn pri">Update Password</button></form>`;
  },
  async manage() {
    const row = (inner, act) => `<form class="row" data-form="${act}">${inner}</form>`;
    $('#main').innerHTML = `
      <div class="nu card"><h2>Send Announcement to Everyone</h2>${row('<input name="value" placeholder="Message" required maxlength="300"><button class="btn pri">Send</button>', 'announce')}</div>
      <div class="nu card"><h2>SDE, BM and Admin accounts</h2>${row(`<input name="value" placeholder="ID" required maxlength="40"><input name="pass" type="password" placeholder="Password" required minlength="6" autocomplete="new-password"><select name="role" aria-label="Role"><option value="sde">SDE</option><option value="bm">BM</option><option value="admin">Super Admin</option></select><button class="btn pri">Create Account</button>`, 'staff_add')}
        ${table(['ID', 'Role', 'Status', ''], O.staff.map(s => `<tr><td>${esc(s.user_id)}</td><td>${RN[s.role]}</td><td>${!s.approved ? btn('staff_active', 'Approve', s.id, 'pri') : `<button class="btn sm ${s.active ? 'ok' : 'no'}" data-act="staff_active" data-id="${s.id}" ${s.id === me.id ? 'disabled' : ''}>${s.active ? 'Active' : 'Inactive'}</button>`}</td><td>${btn('staff_reset', 'Reset Password', s.id)}</td></tr>`).join(''))}</div>
      <div class="nu card"><h2>Companies</h2>${row('<input name="value" placeholder="New company name" required maxlength="100"><button class="btn pri">Add Company</button>', 'company_add')}
        ${table(['Name', ''], O.companies.map(c => `<tr><td>${esc(c.name)}</td><td>${btn('company_rename', 'Rename', c.id)} ${btn('company_delete', 'Delete', c.id, 'no')}</td></tr>`).join(''))}</div>
      <div class="nu card"><h2>L-Codes (ESA accounts)</h2>${row(`<input name="value" placeholder="L-Code" required maxlength="30"><select name="company" aria-label="Company" required>${options(O.companies, x => x.id, '', x => x.name)}</select><button class="btn pri">Add L-Code</button>`, 'lcode_add')}
        ${table(['L-Code', 'Company Name', 'Contact', 'Status'], O.lcodes.map(l => `<tr><td>${esc(l.lcode)}</td><td><select data-map="${l.id}" aria-label="Company for ${esc(l.lcode)}">${options(O.companies, x => x.id, l.company_id, x => x.name)}</select></td><td>${esc([l.contact, l.phone].filter(Boolean).join(' · ') || '—')}</td><td>${btn('lcode_active', l.active ? 'Active' : 'Inactive', l.id, l.active ? 'ok' : 'no')}</td></tr>`).join(''))}</div>
      <div class="nu card"><h2>Database Storage</h2><p id="storage" class="mu">Checking…</p><p class="mu">Cleanup permanently deletes Approved and Rejected calls older than the period you choose. Export them first from Records.</p>
        <div class="row"><select id="months" aria-label="Age"><option value="12">Older than 12 months</option><option value="6">Older than 6 months</option><option value="3">Older than 3 months</option></select>${btn('cleanup', 'Delete old records', '', 'no')}</div></div>`;
    const s = await admin('storage');
    if (s && $('#storage')) $('#storage').textContent = `Database size ${(s.db_bytes / 1048576).toFixed(1)} MB · ${s.calls} calls · ${s.notes} notifications · ${s.sessions} active sessions`;
  }
};

async function drawTrend() {
  const r = await call('api_report', { f: F });
  if (!r || !$('#trend')) return;
  const max = Math.max(1, ...r.trend.map(x => x.n));
  $('#trend').innerHTML = r.trend.map(x => `<div title="${fd(x.d)}: ${x.n}">${x.n || ''}<i style="height:${x.n / max * 70}%"></i><small>${x.d.slice(8)}/${x.d.slice(5, 7)}</small></div>`).join('');
}

/* Drilldown: Company > SDE > ESA > Ticket */
const LEVELS = [['company_id', 'company', 'Company Name'], ['sde_id', 'sde', 'SDE'], ['lcode_id', 'lcode', 'ESA (L-Code)']];
async function loadDrill() {
  const v = view, r = await call('api_report', { f: F });
  if (!r || v !== view) return;
  groups = r.groups;
  drawDrill();
}
async function drawDrill() {
  const v = view, depth = path.length;
  const match = groups.filter(g => path.every((p, i) => g[LEVELS[i][0]] === p.id));
  $('#crumbs').innerHTML = btn('crumb', 'All', 0) + path.map((p, i) => '<span class="mu">›</span>' + btn('crumb', esc(p.name), i + 1)).join('');
  if (depth < 3) {
    const [key, name, head] = LEVELS[depth], sums = new Map();
    match.forEach(g => {
      const s = sums.get(g[key]) || { name: g[name], total: 0, Pending: 0, Approved: 0, Rejected: 0 };
      ['total', ...STATUS].forEach(k => s[k] += g[k]);
      sums.set(g[key], s);
    });
    $('#list').innerHTML = sums.size ? table([head, 'Total', ...STATUS], [...sums].map(([id, s]) => `<tr class="cl" tabindex="0" data-act="dig" data-id="${id}" data-name="${esc(s.name)}"><td>${esc(s.name)}</td><td>${s.total}</td>${STATUS.map(k => `<td>${s[k]}</td>`).join('')}</tr>`).join('')) : empty('No data for these filters.');
  } else {
    const r = await call('api_calls', { f: { ...F, company: path[0].id, sde: path[1].id, esa: path[2].id }, p_limit: 1000 });
    if (!r || v !== view) return;
    rows = r.rows;
    $('#list').innerHTML = LISTS.records();
  }
}

function drawCompanies() {
  const q = $('#cq').value.toLowerCase();
  $('#cnt').textContent = O.mine.length + ' selected';
  $('#list').innerHTML = O.companies.filter(c => c.name.toLowerCase().includes(q)).map(c => `<label class="ck"><input type="checkbox" data-co="${c.id}" ${O.mine.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('') || empty('No companies yet.');
}
function drawBulk() {
  if (!$('#bulk')) return;
  $('#bulk').innerHTML = picked.size ? `<span class="chip">${picked.size} selected</span><span>${btn('bulkApprove', 'Approve selected', '', 'ok')} ${btn('bulkReject', 'Reject selected', '', 'no')}</span>` : '';
}
async function respond(ids, approve) {
  let remark = '';
  if (approve) { if (!await ask(`Approve ${ids.length > 1 ? ids.length + ' Cancel Calls' : 'this Cancel Call'}?`)) return; }
  else if (!(remark = await ask('Reject: enter your remark', { input: true }))) return;
  const r = await call('api_respond', { p_ids: ids, p_approve: approve, p_remark: remark });
  if (!r) return;
  toast(r.done ? `${r.done} updated and ESA notified` : 'Already handled or withdrawn', !r.done);
  picked.clear();
  load();
}

/* ---------- notifications ---------- */
const unread = () => notes.filter(n => n.unread).length;
function drawBell() {
  const b = $('#bell');
  if (b) b.innerHTML = '🔔 Alerts' + (unread() ? `<em>${unread()}</em>` : '');
}
async function poll() {
  const r = await call('api_notes', {}, true);
  if (!Array.isArray(r)) return;
  notes = r;
  const top = r[0]?.id || 0;
  const fresh = lastNote === null ? [] : r.filter(n => n.id > lastNote);
  lastNote = Math.max(top, lastNote || 0);
  drawBell();
  if (!fresh.length) return;
  fresh.slice(0, 3).forEach(n => {
    toast(n.msg);
    try { if (document.hidden && Notification.permission === 'granted') new Notification('Cancel Call Management', { body: n.msg, icon: 'icon.svg' }); } catch { /* not supported on this device */ }
  });
  beep();
  // refresh lists only, so typing in a form is never lost
  if (!document.querySelector('.ov')) { if (tab === 'drill') loadDrill(); else load(); }
}
function beep() {
  try {
    const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.05; o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.15); o.onended = () => c.close();
  } catch { /* sound blocked */ }
}
function showNotes() {
  const canAsk = 'Notification' in window && Notification.permission === 'default';
  modal(`<h2>Notifications</h2>${canAsk ? btn('allow', 'Turn on desktop alerts') : ''}${notes.length ? notes.map(n => `<div class="note ${n.unread ? 'new' : ''}">${esc(n.msg)}<div class="mu small">${ft(n.at)}</div></div>`).join('') : empty('No notifications yet.')}`);
  if (unread()) call('api_notes_seen', { p_id: notes[0].id }, true);
  notes.forEach(n => n.unread = false);
  drawBell();
}

/* ---------- admin actions ---------- */
async function manage(action, d, done = 'Saved') {
  const r = await admin(action, d);
  if (!r) return false;
  toast(action === 'cleanup' ? r.deleted + ' old records deleted' : done);
  O = await call('api_options') || O;
  if (tab === 'manage') VIEWS.manage();
  return true;
}

/* ---------- events ---------- */
const ACTIONS = {
  tab: id => go(id),
  logout: async () => { await call('api_logout', {}, true); store.clear(); location.href = me.role === 'esa' ? 'index.html' : 'staff.html'; },
  close: (id, el) => el.closest('.ov').remove(),
  notes: showNotes,
  allow: async (id, el) => { await Notification.requestPermission(); el.remove(); },
  status: id => { F.status = id; page = 0; load(); },
  page: id => { page = +id; picked.clear(); load(); },
  reset: () => go(tab),
  detail,
  export: exportData,
  withdraw: async id => {
    if (await ask('Withdraw this Cancel Call? It will be removed.') && await call('api_esa_action', { p_id: id, p_action: 'withdraw' })) { toast('Call withdrawn'); load(); }
  },
  resubmit: async id => {
    const m = await ask('Resubmit with new remarks', { input: true, value: rows.find(x => x.id === id)?.remarks, ok: 'Resubmit' });
    if (m && await call('api_esa_action', { p_id: id, p_action: 'resubmit', p_remarks: m })) { toast('Call resubmitted'); load(); }
  },
  approve: id => respond([id], true),
  reject: id => respond([id], false),
  bulkApprove: () => respond([...picked], true),
  bulkReject: () => respond([...picked], false),
  dig: (id, el) => { path.push({ id, name: el.dataset.name }); drawDrill(); },
  crumb: id => { path = path.slice(0, +id); drawDrill(); },
  staff_active: id => { const s = O.staff.find(x => x.id === id); manage('staff_active', { id, value: String(!s.approved || !s.active) }, 'Account updated'); },
  staff_reset: async id => {
    const p = await ask('New password for ' + O.staff.find(x => x.id === id).user_id, { input: true, type: 'password' });
    if (p) manage('staff_reset', { id, value: p }, 'Password reset');
  },
  company_rename: async id => {
    const n = await ask('Rename company', { input: true, value: O.companies.find(x => x.id === id).name });
    if (n) manage('company_rename', { id, value: n }, 'Company renamed');
  },
  company_delete: async id => { if (await ask('Delete this company?')) manage('company_delete', { id }, 'Company deleted'); },
  lcode_active: id => manage('lcode_active', { id, value: String(!O.lcodes.find(x => x.id === id).active) }, 'L-Code updated'),
  cleanup: async () => {
    const months = $('#months').value;
    if (await ask(`Permanently delete resolved calls older than ${months} months?`, { ok: 'Delete' })) manage('cleanup', { value: months });
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) ACTIONS[el.dataset.act]?.(el.dataset.id, el);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelector('.ov #no, .ov [data-act=close]')?.click();
  if (e.key === 'Enter' && e.target.matches('tr[data-act]')) e.target.click();
});

let typing;
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'tk') {
    if (!$('#cd')?.dataset.manual) {
      $('#cd').value = extractDate(e.target.value.trim().toUpperCase(), '');
    }
  }
  if (id === 'cd') {
    if (e.target.value.trim()) e.target.dataset.manual = 'true';
    else delete e.target.dataset.manual;
  }
  if (id === 'cq') drawCompanies();
  if (id === 'search') { clearTimeout(typing); typing = setTimeout(() => { F.q = e.target.value.trim(); page = 0; load(); }, 300); }
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.pick) { el.checked ? picked.add(el.dataset.pick) : picked.delete(el.dataset.pick); drawBulk(); }
  if (el.dataset.map && !await manage('lcode_map', { id: el.dataset.map, value: el.value }, 'Mapping updated')) VIEWS.manage();
  if (el.dataset.co) {
    const id = el.dataset.co, on = el.checked;
    if (await call('api_sde_company', { p_company: id, p_on: on })) O.mine = on ? [...O.mine, id] : O.mine.filter(x => x !== id);
    drawCompanies();
    poll();
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, button = form.querySelector('button:not([type=button])');
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (form.id === 'newcall') {
      const ticket = $('#tk').value.trim().toUpperCase();
      const customer = $('#cn').value.trim();
      const dateStr = extractDate(ticket, $('#cd').value.trim());
      if (!dateStr) return toast('No date found. Please check Ticket Number or enter Created Date (DD/MM/YYYY)', true);
      const isoDate = toIsoDate(dateStr);
      if (!isoDate) return toast('Invalid date format. Use DD/MM/YYYY', true);
      const payload = { p_ticket: ticket, p_date: isoDate, p_remarks: $('#rm').value, p_urgent: $('#urg').checked };
      if (customer) payload.p_customer = customer;
      let ok = await call('api_submit', payload);
      if (!ok && customer) {
        delete payload.p_customer;
        ok = await call('api_submit', payload);
      }
      if (ok) {
        toast('Cancel Call submitted successfully');
        form.reset(); $('#cd').value = ''; delete $('#cd')?.dataset.manual;
        await load();
      }
    } else if (form.id === 'filters') {
      readFilters(); page = 0; path = [];
      await (tab === 'drill' ? loadDrill() : Promise.all([load(), drawTrend()]));
    } else if (form.id === 'profile') {
      const v = id => $('#p_' + id).value;
      if (await call('api_esa_profile', { p_lcode: v('lcode'), p_company: v('company'), p_contact: v('contact'), p_phone: v('phone') })) {
        me = await call('api_me') || me;
        shell(); await VIEWS.profile();
        toast('Profile saved');
      }
    } else if (form.id === 'pwform') {
      if ($('#new').value !== $('#new2').value) return toast('New passwords do not match', true);
      if (await call('api_password', { p_old: $('#old').value, p_new: $('#new').value })) {
        toast('Password updated');
        if (me.mustChange) { me.mustChange = false; await start(); } else form.reset();
      }
    } else if (form.dataset.form) {
      await manage(form.dataset.form, Object.fromEntries(new FormData(form)), form.dataset.form === 'announce' ? 'Announcement sent' : 'Added');
    }
  } finally { button.disabled = false; }
});

/* ---------- start ---------- */
async function start() {
  me = await call('api_me');
  if (!me) { $('#app').innerHTML = '<div class="auth"><div class="nu login"><p>Could not connect.</p><button class="btn pri" onclick="location.reload()">Try again</button> <button class="btn" onclick="store.clear();location.href=\'index.html\'">Logout</button></div></div>'; return; }
  if (me.role !== 'esa') O = await call('api_options') || { companies: [], lcodes: [], staff: [], mine: [] };
  if (location.hash === '#must' && !tab) {
    // default password must be replaced before using the system
    me.mustChange = true; tab = 'password';
    shell(); document.querySelector('nav').hidden = true;
    await VIEWS.password();
    toast('Change the default password to continue', true);
    return;
  }
  const wanted = location.hash.slice(1), tabs = tabsFor().map(t => t[0]);
  await go(tabs.includes(wanted) ? wanted : tabs[0]);
  await poll();
}

if (!T) location.replace('index.html');
else {
  start();
  let ticks = 0;
  // every 20s while visible, every 60s in the background
  setInterval(() => { if (me && !me.mustChange && (!document.hidden || ++ticks % 3 === 0)) poll(); }, 20000);
}
