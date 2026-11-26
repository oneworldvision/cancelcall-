/* Shared helpers */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get() { try { return sessionStorage.getItem('cc_t') || localStorage.getItem('cc_t'); } catch { return null; } },
  set(t, keep) { try { this.clear(); (keep ? localStorage : sessionStorage).setItem('cc_t', t); } catch { toast('Allow browser storage to sign in', true); } },
  clear() { try { sessionStorage.removeItem('cc_t'); localStorage.removeItem('cc_t'); } catch { /* storage blocked */ } }
};

function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'tst' + (bad ? ' er' : '');
  t.textContent = msg;
  $('#toast').append(t);
  setTimeout(() => t.remove(), 4500);
}

/* Call a database function. Returns the data, or undefined after showing the error. */
async function api(fn, args = {}, quiet = false) {
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      if (data?.message === 'SESSION_EXPIRED') { store.clear(); location.replace('index.html'); return; }
      if (data?.code === 'PGRST202') throw new Error('Database not set up. Run schema.sql in Supabase.');
      throw new Error(data?.code === '23505' ? 'This entry already exists' : data?.message || 'Request failed');
    }
    if (data?.error) { if (!quiet) toast(data.error, true); return; }
    return data ?? true;
  } catch (e) {
    if (!quiet) toast(e instanceof TypeError ? 'No connection. Check your internet.' : e.message, true);
  }
}
