// navigator.js
'use strict';

const CONTACT_URL_WORDS = [
  'contact','get-in-touch','inquiry','enquiry','feedback','reach-us','reach-out',
  'appointment','schedule','book','consult','new-patient','patient','request',
  'touch','connect','quote','refer','contactus','contact_us','getintouch',
];

const STRONG_TEXT = [
  'contact us','contact','get in touch','reach us','get in contact',
  'contact form','reach out','write to us','feedback','send us a message',
  'send a message','connect with us','connect','drop us a line','say hello',
  'talk to us','message us','email us','inquire','enquire',
  'book appointment','book a consultation','book now','book online',
  'schedule appointment','schedule now','schedule online','schedule a visit',
  'request appointment','request a call','request a consultation',
  'make an appointment','free consultation','get a quote','request a quote',
  'new patient','new patients','new patient form','patient contact',
  'refer a patient','ask a question','help','support',
  'contacto','contáctanos','contactanos','contato','escríbenos',
];

const HREF_KEYWORDS = [
  'contact','inquiry','enquiry','feedback','reach-us','get-in-touch',
  'connect','appointment','schedule','book','consult','touch',
  'write','message','support','help','quote','refer','new-patient',
  'patient','request','contact_us','contactus','getintouch','reachout',
];

const BLACKLIST_TEXT = [
  'about us','home','portfolio','blog','news','gallery','team',
  'careers','jobs','faq','privacy','terms','sitemap','login',
  'register','shop','store','products','pricing','testimonials','reviews',
  'directions','map','hours','locations','insurance','financing',
];

const BLACKLIST_HREF = [
  'javascript','mailto','tel','login','register','wp-admin','wp-login',
  'shop','cart','checkout','blog','news','gallery','portfolio','careers','jobs',
  'privacy','terms','sitemap',
];

const COMMON_PATHS = [
  '/contact','/contact-us','/contact_us','/contactus',
  '/contact.html','/contact-us.html','/contact.htm','/contact_us.htm','/contact.php',
  '/get-in-touch','/getintouch','/reach-us','/reach-out',
  '/appointment','/appointments','/book-appointment','/book','/book-now','/book-online',
  '/schedule','/schedule-appointment','/schedule-online','/schedule-now',
  '/request-appointment','/request-consultation','/request','/request-info',
  '/new-patient','/new-patients','/new-patient-form','/newpatient',
  '/patient-forms','/patient-contact',
  '/free-consultation','/consultation',
  '/inquiry','/enquiry','/feedback',
  '/support','/help','/quote','/get-a-quote',
  '/refer','/referral','/write-to-us','/say-hello',
];

const HAS_CONTACT_FORM_JS = `
(function() {
  var PLUGINS = ['wpcf7','wpforms','gform','gravityform','ninja-form','formidable',
                 'elementor-form','hs-form','hubspot','contact-form','cf7','nf-form','fluentform'];
  var forms = Array.from(document.querySelectorAll('form') || []);
  for (var i = 0; i < forms.length; i++) {
    var f = forms[i];
    var html     = (f.outerHTML || '').toLowerCase().substring(0, 3000);
    var isPlugin = PLUGINS.some(function(p){ return html.indexOf(p) !== -1; });
    var hasTextarea = !!f.querySelector('textarea:not([name*=recaptcha i]):not([id*=recaptcha i])');
    var hasEmail    = !!f.querySelector('input[type=email],[name*=email i],[id*=email i],[placeholder*=email i]');
    var hasPhone    = !!f.querySelector('input[type=tel],[name*=phone i],[name*=mobile i],[id*=phone i],[placeholder*=phone i]');
    var hasMsg      = !!f.querySelector('[name*=message i],[name*=comment i],[name*=subject i],[id*=message i],[placeholder*=message i]');
    var hasName     = !!f.querySelector('[name*=name i],[id*=name i],[placeholder*=name i]');
    var visible     = Array.from(f.querySelectorAll('input,textarea,select'))
      .filter(function(e){ return e.offsetParent !== null && e.type !== 'hidden'; }).length;
    var isPw     = !!f.querySelector('input[type=password]');
    var isSearch = ((f.id||'').toLowerCase().indexOf('search') !== -1 ||
                    (f.className||'').toLowerCase().indexOf('search') !== -1) && !hasEmail && !hasTextarea;
    if (isPw || isSearch) continue;
    if (isPlugin && visible >= 2) return true;
    if (visible >= 1 && (hasEmail || hasTextarea || hasMsg)) return true;
    if (visible >= 2 && hasName && hasPhone) return true;
  }
  var vis = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password]),textarea:not([name*=recaptcha i])'
  )).filter(function(e){ return e.offsetParent !== null; });
  if (vis.length >= 2) {
    var hasE  = vis.some(function(e){ return e.type==='email'||(e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase().indexOf('email')!==-1; });
    var hasTa = vis.some(function(e){ return e.tagName.toLowerCase()==='textarea'; });
    var hasM  = vis.some(function(e){ return (e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase().match(/message|comment|subject|inquiry|enquiry/); });
    if (hasE || hasTa || hasM) return true;
  }
  return false;
})();
`;

const SCAN_LINKS_JS = `
(function(strongKws, hrefKws, blackText, blackHref) {
  var scored = []; var seen = new Set();
  document.querySelectorAll('a[href]').forEach(function(a) {
    var href  = (a.getAttribute('href') || '').trim();
    var text  = (a.innerText || a.textContent || '').trim().toLowerCase().replace(/\\s+/g,' ');
    var hrefL = href.toLowerCase();
    if (!href || href === '#') return;
    if (['javascript:','mailto:','tel:'].some(function(p){ return hrefL.startsWith(p); })) return;
    if (blackHref.some(function(b){ return hrefL.indexOf(b) !== -1; })) return;
    if (blackText.some(function(b){ return text === b; })) return;
    var score = 0;
    strongKws.forEach(function(k) {
      if (text === k) score += 30;
      else if (text.indexOf(k) !== -1) score += 12;
    });
    hrefKws.forEach(function(k) {
      if (hrefL.indexOf(k) !== -1) score += 10;
    });
    var inNav = !!a.closest('nav,header,[class*=menu],[class*=nav],[id*=menu],[id*=nav],[class*=header],[role=navigation]');
    if (inNav && score > 0) score += 8;
    if (score > 0 && !seen.has(href)) {
      seen.add(href);
      scored.push({ href: href, label: text || href, score: score });
    }
  });
  scored.sort(function(a,b){ return b.score - a.score; });
  return scored.slice(0, 12).map(function(s){ return [s.href, s.label, s.score]; });
})(arguments[0], arguments[1], arguments[2], arguments[3]);
`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForPageReady(driver, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await driver.executeScript('return document.readyState') === 'complete') return; } catch (_) {}
    await sleep(200);
  }
}

function normalizeHost(host) { return host.replace(/^www\./, ''); }

function isContactUrl(url) {
  return CONTACT_URL_WORDS.some(w => url.toLowerCase().includes(w));
}

function resolveUrl(href, baseUrl) {
  try {
    if (href.startsWith('http')) return href;
    const base = new URL(baseUrl);
    if (href.startsWith('//')) return `${base.protocol}${href}`;
    if (href.startsWith('/')) return `${base.protocol}//${base.host}${href}`;
    // relative path like contact_us.htm
    const dir = base.pathname.endsWith('/') ? base.pathname : base.pathname.replace(/\/[^/]*$/, '/');
    return `${base.protocol}//${base.host}${dir}${href}`;
  } catch (_) { return null; }
}

async function checkPageForForm(driver) {
  await sleep(1500);
  let has = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
  if (has) return true;
  try { await driver.executeScript('window.scrollTo(0, Math.min(800, document.body.scrollHeight*0.5))'); } catch (_) {}
  await sleep(1000);
  return !!(await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false));
}

async function findContactPage(driver) {
  console.log('   🔎 Looking for contact page...');
  const baseUrl = await driver.getCurrentUrl();

  // 1. Already on contact URL?
  if (isContactUrl(baseUrl)) {
    console.log('      ✅ Already on contact page (URL match)');
    return true;
  }

  // 2. Current page already has a contact form?
  try {
    if (await driver.executeScript(HAS_CONTACT_FORM_JS)) {
      console.log('      ✅ Contact form found on current page');
      return true;
    }
  } catch (_) {}

  // 3. Scan links — retry after scroll for JS-rendered navs
  let candidates = [];
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      try { await driver.executeScript('window.scrollTo(0, 400)'); } catch (_) {}
      await sleep(800);
    }
    try {
      candidates = await driver.executeScript(
        SCAN_LINKS_JS, STRONG_TEXT, HREF_KEYWORDS, BLACKLIST_TEXT, BLACKLIST_HREF
      ) || [];
    } catch (_) {}
    if (candidates.length) break;
  }
  try { await driver.executeScript('window.scrollTo(0,0)'); } catch (_) {}

  if (candidates.length) {
    console.log(`      🔗 Candidates: ${candidates.map(c => `"${c[1]}"(${c[2]})`).join(', ')}`);
  }

  // 4. Try each candidate link
  for (const [href, label, score] of candidates) {
    try {
      const absUrl = resolveUrl(href, baseUrl);
      if (!absUrl) continue;
      const u1 = new URL(absUrl), u2 = new URL(baseUrl);
      if (u1.pathname === u2.pathname && normalizeHost(u1.host) === normalizeHost(u2.host)) continue;
      if (normalizeHost(u1.host) !== normalizeHost(u2.host)) continue;

      await driver.get(absUrl);
      await waitForPageReady(driver, 6000);
      await sleep(1000);
      const destUrl = await driver.getCurrentUrl();

      if (isContactUrl(destUrl)) {
        console.log(`      ✅ Navigated to: "${label}" (score=${score})`);
        return true;
      }
      const hasForm = await checkPageForForm(driver);
      if (hasForm) {
        console.log(`      ✅ Form found on: "${label}" (score=${score})`);
        return true;
      }

      console.log(`      ⚠️ "${label}" has no contact form — going back`);
      await driver.navigate().back();
      await waitForPageReady(driver, 4000);
    } catch (_) {
      try { await driver.navigate().back(); } catch (_2) {}
      await waitForPageReady(driver, 3000).catch(() => {});
    }
  }

  // 5. Try common contact URL paths directly
  try {
    const currentUrl = await driver.getCurrentUrl().catch(() => baseUrl);
    const base = new URL(currentUrl);
    const basePath = new URL(baseUrl).pathname;
    for (const p of COMMON_PATHS) {
      const tryUrl = `${base.protocol}//${base.host}${p}`;
      try {
        await driver.get(tryUrl);
        await waitForPageReady(driver, 5000);
        const destUrl = await driver.getCurrentUrl();
        const destPath = new URL(destUrl).pathname;
        if (destPath === '/' || destPath === '' || destPath === basePath) continue;
        if (isContactUrl(destUrl)) {
          console.log(`      ✅ Found via common path: ${p}`);
          return true;
        }
        if (await checkPageForForm(driver)) {
          console.log(`      ✅ Form found via common path: ${p}`);
          return true;
        }
      } catch (_) {}
    }
    await driver.get(baseUrl).catch(() => {});
    await waitForPageReady(driver, 4000);
  } catch (_) {}

  // 6. Try sitemap.xml
  try {
    const base = new URL(baseUrl);
    await driver.get(`${base.protocol}//${base.host}/sitemap.xml`);
    await waitForPageReady(driver, 5000);
    const contactUrls = await driver.executeScript(function() {
      var text = document.body ? document.body.innerText : '';
      var urls = text.match(/https?:\/\/[^\s<>"]+/g) || [];
      return urls.filter(function(u) {
        var ul = u.toLowerCase();
        return ['contact','get-in-touch','appointment','schedule','book','inquiry',
                'enquiry','new-patient','reach','feedback','consult','request']
          .some(function(w){ return ul.indexOf(w) !== -1; });
      }).slice(0, 5);
    }).catch(() => []);
    for (const u of contactUrls) {
      try {
        const u1 = new URL(u);
        if (normalizeHost(u1.host) !== normalizeHost(new URL(baseUrl).host)) continue;
        await driver.get(u);
        await waitForPageReady(driver, 5000);
        const destUrl = await driver.getCurrentUrl();
        if (isContactUrl(destUrl)) { console.log(`      ✅ Found via sitemap: ${u}`); return true; }
        if (await checkPageForForm(driver)) { console.log(`      ✅ Form via sitemap: ${u}`); return true; }
        await driver.navigate().back();
        await waitForPageReady(driver, 3000);
      } catch (_) {}
    }
    await driver.get(baseUrl).catch(() => {});
    await waitForPageReady(driver, 4000);
  } catch (_) {}

  console.log('      ℹ️ No contact page found, using current page');
  return false;
}

module.exports = { findContactPage };
