/* ESA login, staff login and register pages */
const page = document.body.dataset.page;
let regMode = location.hash === '#sde' ? 'sde' : 'esa';

const field = (id, label, attrs = '') => `<label class="l" for="${id}">${label}</label><input id="${id}" ${attrs}>`;
const keepBox = '<label class="ck plain"><input type="checkbox" id="keep"> Keep me signed in</label>';

const VIEWS = {
  esa: () => ['ESA Login', 'Enter your L-Code to continue.',
    field('lcode', 'L-Code', 'required autocomplete="username" autocapitalize="characters"') + keepBox + '<button class="btn pri">Login</button>',
    '<a href="register.html">New ESA? Register your L-Code</a><a href="staff.html">SDE / BM / Admin login</a>'],
  staff: () => ['Staff Login', 'For SDE, BM and Super Admin.',
    field('uid', 'ID', 'required autocomplete="username"') + field('pass', 'Password', 'type="password" required autocomplete="current-password"') + keepBox + '<button class="btn pri">Login</button>',
    '<a href="register.html#sde">New SDE? Register</a><a href="index.html">ESA login</a>'],
  register: () => ['Create Account', regMode === 'esa' ? 'Register once with your primary L-Code. You can edit it later in Profile.' : 'SDE accounts start working after Super Admin approval.',
    (regMode === 'esa'
      ? field('lcode', 'Primary L-Code', 'required maxlength="30" autocapitalize="characters"') + field('company', 'Company Name (Service Center Name)', 'required maxlength="100"') + field('contact', 'Contact person (optional)', 'maxlength="60"') + field('phone', 'Phone (optional)', 'type="tel" maxlength="20"')
      : field('uid', 'SDE ID', 'required maxlength="40" autocomplete="username"') + field('pass', 'Password (6+ characters)', 'type="password" required minlength="6" autocomplete="new-password"') + field('pass2', 'Confirm Password', 'type="password" required autocomplete="new-password"'))
    + '<button class="btn pri">Register</button>',
    '<a href="index.html">Already registered? ESA login</a><a href="staff.html">Staff login</a>']
};

function draw() {
  const [title, sub, form, links] = VIEWS[page]();
  const tabs = page === 'register'
    ? `<div class="tabs">${[['esa', 'ESA Register'], ['sde', 'SDE Register']].map(([k, l]) => `<button type="button" class="btn sm ${regMode === k ? 'on' : ''}" data-reg="${k}">${l}</button>`).join('')}</div>` : '';
  $('#app').innerHTML = `<div class="auth"><div class="nu login"><img src="icon.svg" alt=""><h1>${title}</h1><p class="mu">${sub}</p>${tabs}<form>${form}</form><div class="links">${links}</div></div></div>`;
  document.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => { regMode = b.dataset.reg; draw(); });
  $('form').onsubmit = submit;
}

async function submit(e) {
  e.preventDefault();
  const v = id => $('#' + id)?.value.trim() || '';
  const btn = $('form .pri');
  btn.disabled = true;
  if (page === 'esa' || page === 'staff') {
    const r = page === 'esa'
      ? await api('api_esa_login', { p_lcode: v('lcode') })
      : await api('api_staff_login', { p_uid: v('uid'), p_pass: $('#pass').value });
    if (r) {
      store.set(r.token, $('#keep').checked);
      location.href = 'dashboard.html' + (r.must_change ? '#must' : '');
      return;
    }
  } else if (regMode === 'esa') {
    if (await api('api_register_esa', { p_lcode: v('lcode'), p_company: v('company'), p_contact: v('contact'), p_phone: v('phone') })) {
      toast('Registered. You can now login.');
      setTimeout(() => location.href = 'index.html', 1200);
      return;
    }
  } else if ($('#pass').value !== $('#pass2').value) {
    toast('Passwords do not match', true);
  } else if (await api('api_register_sde', { p_uid: v('uid'), p_pass: $('#pass').value })) {
    toast('Registered. Wait for Super Admin approval, then login.');
    $('form').reset();
  }
  btn.disabled = false;
}

if (store.get() && page !== 'register') location.replace('dashboard.html');
else draw();
