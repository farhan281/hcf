// navigator.js
'use strict';

const CONTACT_URL_WORDS = [
  'contact','get-in-touch','inquiry','enquiry','feedback','reach-us',
  'reach-out','connect','appointment','book-appointment','schedule',
  'touch','write-to-us','send-message','consult','new-patient',
  'patient-form','refer','request','quote',
];

const STRONG_TEXT = [
  'contact us','contact','get in touch','reach us','get in contact',
  'contact form','reach out','write to us','feedback','send us a message',
  'send a message','connect with us','connect','drop us a line',
  'drop a line','say hello','say hi','talk to us','speak to us',
  'message us','email us','inquire','inquire now','enquire','enquire now',
  'book appointment','book a consultation','schedule appointment',
  'schedule a consultation','request appointment','request a call',
  'free consultation','get a quote','request a quote','get quote',
  'make an appointment','appointment request','new patient',
  'new patient form','patient contact','refer a patient',
  'ask a question','have a question','questions','help','support',
  'contacto','contáctanos','contactanos','contato','escríbenos',
];

const HREF_KEYWORDS = [
  'contact','inquiry','enquiry','feedback','reach-us','get-in-touch',
  'connect','appointment','schedule','book','consult','touch',
  'write','message','support','help','quote','refer','new-patient',
  'patient','request',
];

const BLACKLIST_TEXT = [
  'about us','home','portfolio','blog','news','gallery','team',
  'careers','jobs','faq','privacy','terms','sitemap','login',
  'register','shop','store','products','pricing','testimonials',
  'reviews','directions','map','hours','locations',
];

const BLACKLIST_HREF = [
  'javascript','login','register','shop','cart','checkout',
  'blog','news','gallery','portfolio','careers','jobs',
  'privacy','terms','sitemap',
];

const COMMON_PATHS = [
  '/contact', '/contact-us', '/contact_us', '/contactus',
  '/get-in-touch', '/reach-us', '/reach-out',
  '/connect', '/connect-with-us',
  '/appointment', '/appointments', '/book-appointment', '/book',
  '/schedule', '/schedule-appointment', '/schedule-consultation',
  '/request-appointment', '/request-consultation', '/request-a-call',
  '/new-patient', '/new-patients', '/new-patient-form',
  '/patient-forms', '/patient-contact',
  '/free-consultation', '/consultation',
  '/inquiry', '/enquiry', '/feedback',
  '/support', '/help', '/quote', '/get-a-quote',
  '/refer', '/referral',
];

// Detect if current page has a usable contact form
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
    var hasMsg      = !!f.querySelector('[name*=message i],[name*=comment i],[name*=subject i],[id*=message i],[placeholder*=message i],[placeholder*=subject i]');
    var hasName     = !!f.querySelector('[name*=name i],[id*=name i],[placeholder*=name i]');
    var visible     = Array.from(f.querySelectorAll('input,textarea,select'))
      .filter(function(e){ return e.offsetParent !== null && e.type !== 'hidden'; }).length;
    var isPw     = !!f.querySelector('input[type=password]');
    var isSearch = ((f.id||'').toLowerCase().indexOf('search') !== -1 ||
                    (f.className||'').toLowerCase().indexOf('search') !== -1) && !hasEmail && !hasTextarea;
    if (isPw || isSearch) continue;
    // Plugin form with any visible inputs = contact form
    if (isPlugin && visible >= 2) return true;
    // Has email or textarea with at least 1 visible field
    if (visible >= 1 && (hasEmail || hasTextarea || hasMsg)) return true;
    // Has name + phone (appointment forms)
    if (visible >= 2 && hasName && hasPhone) return true;
  }
  // Formless inputs (React/Vue/Angular SPA)
  var visibleInputs = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password]),' +
    'textarea:not([name*=recaptcha i])'
  )).filter(function(e){ return e.offsetParent !== null; });
  if (visibleInputs.length >= 2) {
    var hasE = visibleInputs.some(function(e){
      return e.type==='email' ||
        (e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase().indexOf('email')!==-1;
    });
    var hasTa = visibleInputs.some(function(e){ return e.tagName.toLowerCase()==='textarea'; });
    var hasM  = visibleInputs.some(function(e){
      return (e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase()
        .match(/message|comment|subject|inquiry|enquiry/);
    });
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
    if (!href || href === '#' || href.startsWith('javascript:')
        || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (blackText.some(function(b){ return text === b; })) return;
    if (blackHref.some(function(b){ return hrefL.indexOf(b) !== -1; })) return;
    var score = 0;
    strongKws.forEach(function(k) {
      if (text === k) score += 25;
      else if (text.indexOf(k) !== -1) score += 10;
    });
    hrefKws.forEach(function(k) {
      if (hrefL.indexOf(k) !== -1) score += 8;
    });
    var inNav = !!a.closest('nav,header,[class*=menu],[class*=nav],[id*=menu],[id*=nav],[class*=header]');
    if (inNav && score > 0) score += 6;
    if (score > 0 && !seen.has(href)) {
      seen.add(href);
      scored.push({ href: href, label: text || href, score: score });
    }
  });
  scored.sort(function(a,b){ return b.score - a.score; });
  return scored.slice(0, 10).map(function(s){ return [s.href, s.label, s.score]; });
})(arguments[0], arguments[1], arguments[2], arguments[3]);
`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForPageReady(driver, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await driver.executeScript('return document.readyState') === 'complete') return;
    } catch (_) {}
    await sleep(200);
  }
}

function isContactUrl(url) {
  const u = url.toLowerCase();
  return CONTACT_URL_WORDS.some(w => u.includes(w));
}

async function checkPageForForm(driver) {
  // Wait a bit for lazy-loaded content
  await sleep(1200);
  let hasForm = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
  if (hasForm) return true;
  // Scroll down and check again
  try { await driver.executeScript('window.scrollTo(0, Math.min(600, document.body.scrollHeight * 0.4))'); }
  catch (_) {}
  await sleep(800);
  hasForm = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
  return !!hasForm;
}

function normalizeHost(host) {
  return host.replace(/^www\./, '');
}

async function tryNavigateTo(driver, absUrl, baseUrl) {
  try {
    const u1 = new URL(absUrl), u2 = new URL(baseUrl);
    // Allow www vs non-www on same domain
    if (normalizeHost(u1.host) !== normalizeHost(u2.host)) return false;
    await driver.get(absUrl);
    await waitForPageReady(driver, 6000);
    const destUrl = await driver.getCurrentUrl();
    const destPath = new URL(destUrl).pathname;
    if (destPath === '/' || destPath === '') return false;
    return true;
  } catch (_) { return false; }
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
  const homeHasForm = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
  if (homeHasForm) {
    console.log('      ✅ Contact form found on current page');
    return true;
  }

  // 3. Scan nav/menu links — retry after scroll for JS-rendered navs
  let candidates = [];
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      try { await driver.executeScript('window.scrollTo(0, 300)'); } catch (_) {}
      await sleep(800);
    }
    try {
      candidates = await driver.executeScript(
        SCAN_LINKS_JS, STRONG_TEXT, HREF_KEYWORDS, BLACKLIST_TEXT, BLACKLIST_HREF
      ) || [];
    } catch (_) {}
    if (candidates.length) break;
  }
  // Scroll back to top
  try { await driver.executeScript('window.scrollTo(0,0)'); } catch (_) {}

  if (candidates.length) {
    console.log(`      🔗 Candidates: ${candidates.map(c => `"${c[1]}"(${c[2]})`).join(', ')}`);
  }

  // 4. Try each candidate link
  for (const [href, label, score] of candidates) {
    try {
      let absUrl = href;
      if (!href.startsWith('http')) {
        const u = new URL(baseUrl);
        absUrl = `${u.protocol}//${u.host}${href.startsWith('/') ? href : '/' + href}`;
      }
      const u1 = new URL(absUrl), u2 = new URL(baseUrl);
      if (u1.pathname === u2.pathname && u1.host === u2.host) continue;
      if (BLACKLIST_HREF.some(b => absUrl.toLowerCase().includes(b))) continue;

      const navigated = await tryNavigateTo(driver, absUrl, baseUrl);
      if (!navigated) continue;

      const destUrl = await driver.getCurrentUrl();
      // If URL itself is a contact URL, stay here regardless of form
      if (isContactUrl(destUrl)) {
        console.log(`      ✅ On contact URL: "${label}" (score=${score})`);
        return true;
      }
      // Check for form
      const hasForm = await checkPageForForm(driver);
      if (hasForm) {
        console.log(`      ✅ Form found on: "${label}" (score=${score})`);
        return true;
      }

      console.log(`      ⚠️ "${label}" — no form, going back`);
      await driver.navigate().back();
      await waitForPageReady(driver, 4000);
    } catch (_) {
      try { await driver.navigate().back(); } catch (_2) {}
      await waitForPageReady(driver, 3000).catch(() => {});
    }
  }

  // 5. Try common contact URL paths directly
  try {
    const base = new URL(baseUrl);
    for (const p of COMMON_PATHS) {
      const tryUrl = `${base.protocol}//${base.host}${p}`;
      try {
        await driver.get(tryUrl);
        await waitForPageReady(driver, 5000);
        const destUrl = await driver.getCurrentUrl();
        const destPath = new URL(destUrl).pathname;
        // Redirected to home = 404
        if (destPath === '/' || destPath === '' || destPath === baseUrl) continue;
        if (isContactUrl(destUrl)) {
          console.log(`      ✅ Found via common path: ${p}`);
          return true;
        }
        const hasForm = await checkPageForForm(driver);
        if (hasForm) {
          console.log(`      ✅ Form found via common path: ${p}`);
          return true;
        }
      } catch (_) {}
    }
    // Nothing found — go back to base
    await driver.get(baseUrl).catch(() => {});
    await waitForPageReady(driver, 4000);
  } catch (_) {}

  console.log('      ℹ️ No contact page found, using current page');
  return false;
}

module.exports = { findContactPage };
