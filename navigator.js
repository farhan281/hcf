// navigator.js
'use strict';

// ── URL words that indicate a contact page ────────────────────────────────────
const CONTACT_URL_WORDS = [
  'contact','get-in-touch','inquiry','enquiry','feedback','reach-us','reach-out',
  'connect','appointment','book-appointment','schedule','touch','write-to-us',
  'send-message','consult','new-patient','patient-form','refer','request','quote',
  'contact_us','contactus','getintouch','reachout','reachme',
];

// ── Link text keywords — scored by relevance ─────────────────────────────────
// [keyword, score]
const TEXT_SCORES = [
  // Exact high-value
  ['contact us', 40], ['contact', 35], ['get in touch', 40], ['reach us', 35],
  ['write to us', 35], ['send us a message', 35], ['send a message', 30],
  ['connect with us', 30], ['drop us a line', 30], ['drop a line', 25],
  ['say hello', 25], ['say hi', 20], ['talk to us', 30], ['speak to us', 25],
  ['message us', 25], ['email us', 25], ['reach out', 25],
  // Appointment / booking
  ['book appointment', 35], ['book a consultation', 35], ['book now', 30],
  ['book online', 30], ['schedule appointment', 35], ['schedule a visit', 30],
  ['schedule now', 30], ['schedule online', 30], ['request appointment', 35],
  ['request a call', 30], ['request a consultation', 30], ['make an appointment', 35],
  ['appointment request', 30], ['free consultation', 30], ['get a quote', 25],
  ['request a quote', 25], ['get quote', 20],
  // Patient / medical
  ['new patient', 35], ['new patients', 35], ['new patient form', 35],
  ['patient contact', 30], ['refer a patient', 25], ['patient inquiry', 30],
  // Inquiry
  ['inquire', 25], ['inquire now', 30], ['enquire', 25], ['enquire now', 30],
  ['ask a question', 25], ['have a question', 20], ['questions', 15],
  // Support / help
  ['help', 15], ['support', 15], ['feedback', 20],
  // Spanish / other
  ['contacto', 35], ['contáctanos', 35], ['contactanos', 35],
  ['contato', 35], ['escríbenos', 30],
];

// ── HREF keywords that boost score ───────────────────────────────────────────
const HREF_BOOSTS = [
  ['contact', 20], ['inquiry', 15], ['enquiry', 15], ['feedback', 12],
  ['reach', 12], ['get-in-touch', 18], ['getintouch', 18],
  ['connect', 10], ['appointment', 18], ['schedule', 15], ['book', 12],
  ['consult', 12], ['touch', 10], ['write', 8], ['message', 8],
  ['support', 8], ['help', 6], ['quote', 8], ['refer', 8],
  ['new-patient', 18], ['newpatient', 18], ['patient', 10], ['request', 10],
  ['contact_us', 20], ['contactus', 20],
];

// ── Text that is NEVER a contact link ────────────────────────────────────────
// Only exact full-text matches — NOT substring matches on href
const BLACKLIST_TEXT_EXACT = new Set([
  'home','about us','our team','meet our team','our story','who we are',
  'portfolio','blog','news','gallery','media','team','staff',
  'careers','jobs','faq','faqs','privacy policy','privacy','terms',
  'terms of service','sitemap','login','sign in','register','sign up',
  'shop','store','products','pricing','plans','testimonials','reviews',
  'directions','map','hours','locations','our location','find us',
  'insurance','payments','financing',
]);

// ── HREF patterns that are NEVER contact pages ────────────────────────────────
const BLACKLIST_HREF_CONTAINS = [
  'javascript:','mailto:','tel:','#','login','signin','register','signup',
  'shop','cart','checkout','wp-admin','wp-login',
];

// ── Common contact page paths to try directly ─────────────────────────────────
const COMMON_PATHS = [
  '/contact', '/contact-us', '/contact_us', '/contactus', '/contact.html',
  '/contact-us.html', '/contact_us.htm', '/contact.htm', '/contact.php',
  '/get-in-touch', '/getintouch', '/reach-us', '/reach-out', '/reachout',
  '/connect', '/connect-with-us',
  '/appointment', '/appointments', '/book-appointment', '/book', '/book-now',
  '/book-online', '/schedule', '/schedule-appointment', '/schedule-consultation',
  '/schedule-online', '/schedule-now',
  '/request-appointment', '/request-consultation', '/request-a-call',
  '/request', '/request-info',
  '/new-patient', '/new-patients', '/new-patient-form', '/newpatient',
  '/patient-forms', '/patient-contact', '/patient-inquiry',
  '/free-consultation', '/consultation',
  '/inquiry', '/enquiry', '/feedback',
  '/support', '/help', '/quote', '/get-a-quote',
  '/refer', '/referral',
  '/write-to-us', '/message-us', '/say-hello',
];

// ── Detect if current page has a usable contact form ─────────────────────────
const HAS_CONTACT_FORM_JS = `
(function() {
  var PLUGINS = ['wpcf7','wpforms','gform','gravityform','ninja-form','formidable',
                 'elementor-form','hs-form','hubspot','contact-form','cf7','nf-form',
                 'fluentform','fluent-form','mc4wp'];
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
    if (isPlugin && visible >= 2) return true;
    if (visible >= 1 && (hasEmail || hasTextarea || hasMsg)) return true;
    if (visible >= 2 && hasName && hasPhone) return true;
  }
  // Formless SPA inputs
  var vis = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password]),textarea:not([name*=recaptcha i])'
  )).filter(function(e){ return e.offsetParent !== null; });
  if (vis.length >= 2) {
    var hasE = vis.some(function(e){
      return e.type==='email' || (e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase().indexOf('email')!==-1;
    });
    var hasTa = vis.some(function(e){ return e.tagName.toLowerCase()==='textarea'; });
    var hasM  = vis.some(function(e){
      return (e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase().match(/message|comment|subject|inquiry|enquiry/);
    });
    if (hasE || hasTa || hasM) return true;
  }
  return false;
})();
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
  const u = url.toLowerCase();
  return CONTACT_URL_WORDS.some(w => u.includes(w));
}

// Resolve relative URL to absolute
function resolveUrl(href, baseUrl) {
  try {
    if (href.startsWith('http')) return href;
    const base = new URL(baseUrl);
    if (href.startsWith('//')) return `${base.protocol}${href}`;
    if (href.startsWith('/')) return `${base.protocol}//${base.host}${href}`;
    // Relative path — resolve against current directory
    const basePath = base.pathname.endsWith('/') ? base.pathname : base.pathname.replace(/\/[^/]*$/, '/');
    return `${base.protocol}//${base.host}${basePath}${href}`;
  } catch (_) { return null; }
}

// Score all links on page and return top candidates
async function scanLinks(driver, baseUrl) {
  return await driver.executeScript(function() {
    var TEXT_SCORES  = arguments[0];
    var HREF_BOOSTS  = arguments[1];
    var BLACKLIST    = arguments[2];

    var scored = [], seen = new Set();

    document.querySelectorAll('a[href]').forEach(function(a) {
      var href  = (a.getAttribute('href') || '').trim();
      var text  = (a.innerText || a.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      var hrefL = href.toLowerCase();

      // Skip empties and non-navigable
      if (!href || href === '#') return;
      if (['javascript:','mailto:','tel:'].some(function(p){ return hrefL.startsWith(p); })) return;

      // Skip blacklisted hrefs
      var badHref = ['wp-admin','wp-login','login','signin','register','signup',
                     'shop','cart','checkout'].some(function(b){ return hrefL.indexOf(b) !== -1; });
      if (badHref) return;

      // Skip exact blacklisted text
      if (BLACKLIST.indexOf(text) !== -1) return;

      var score = 0;

      // Score by link text
      for (var i = 0; i < TEXT_SCORES.length; i++) {
        var kw = TEXT_SCORES[i][0], pts = TEXT_SCORES[i][1];
        if (text === kw) { score += pts + 10; break; }  // exact match bonus
        if (text.indexOf(kw) !== -1) { score += pts; break; }
      }

      // Score by href
      for (var j = 0; j < HREF_BOOSTS.length; j++) {
        var hkw = HREF_BOOSTS[j][0], hpts = HREF_BOOSTS[j][1];
        if (hrefL.indexOf(hkw) !== -1) { score += hpts; break; }
      }

      // Boost if in nav/header/menu
      var inNav = !!a.closest('nav,header,[class*=menu],[class*=nav],[id*=menu],[id*=nav],[class*=header],[role=navigation]');
      if (inNav && score > 0) score += 8;

      // Boost if it's a button-style link
      var isBtn = (a.className||'').toLowerCase().match(/btn|button|cta/);
      if (isBtn && score > 0) score += 5;

      if (score > 0 && !seen.has(href)) {
        seen.add(href);
        scored.push([href, text || href, score]);
      }
    });

    scored.sort(function(a, b){ return b[2] - a[2]; });
    return scored.slice(0, 12);
  }, TEXT_SCORES, HREF_BOOSTS, Array.from(BLACKLIST_TEXT_EXACT)).catch(() => []);
}

async function checkPageForForm(driver) {
  await sleep(1500);
  let hasForm = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
  if (hasForm) return true;
  try { await driver.executeScript('window.scrollTo(0, Math.min(800, document.body.scrollHeight * 0.5))'); } catch (_) {}
  await sleep(1000);
  hasForm = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
  return !!hasForm;
}

async function tryGoTo(driver, absUrl, baseUrl) {
  try {
    const u1 = new URL(absUrl), u2 = new URL(baseUrl);
    if (normalizeHost(u1.host) !== normalizeHost(u2.host)) return false;
    await driver.get(absUrl);
    await waitForPageReady(driver, 6000);
    const dest = await driver.getCurrentUrl();
    const destPath = new URL(dest).pathname;
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
  if (await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false)) {
    console.log('      ✅ Contact form found on current page');
    return true;
  }

  // 3. Scan all links — 2 passes (second after scroll for JS navs)
  let candidates = [];
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      try { await driver.executeScript('window.scrollTo(0, 400)'); } catch (_) {}
      await sleep(800);
    }
    candidates = await scanLinks(driver, baseUrl);
    if (candidates.length) break;
  }
  try { await driver.executeScript('window.scrollTo(0,0)'); } catch (_) {}

  if (candidates.length) {
    console.log(`      🔗 Candidates: ${candidates.map(c => `"${c[1]}"(${c[2]})`).join(', ')}`);
  }

  // 4. Try each candidate
  for (const [href, label, score] of candidates) {
    try {
      const absUrl = resolveUrl(href, baseUrl);
      if (!absUrl) continue;

      const u1 = new URL(absUrl), u2 = new URL(baseUrl);
      if (u1.pathname === u2.pathname && normalizeHost(u1.host) === normalizeHost(u2.host)) continue;

      const navigated = await tryGoTo(driver, absUrl, baseUrl);
      if (!navigated) continue;

      const destUrl = await driver.getCurrentUrl();

      // Contact URL = stay regardless of form presence
      if (isContactUrl(destUrl)) {
        console.log(`      ✅ Contact URL: "${label}" (score=${score})`);
        return true;
      }

      const hasForm = await checkPageForForm(driver);
      if (hasForm) {
        console.log(`      ✅ Form found: "${label}" (score=${score})`);
        return true;
      }

      console.log(`      ⚠️ "${label}" — no form, back`);
      await driver.navigate().back();
      await waitForPageReady(driver, 4000);
    } catch (_) {
      try { await driver.navigate().back(); } catch (_2) {}
      await waitForPageReady(driver, 3000).catch(() => {});
    }
  }

  // 5. Try common paths directly
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
        // Redirected to home or same page = 404
        if (destPath === '/' || destPath === '' || destPath === basePath) continue;
        if (isContactUrl(destUrl)) {
          console.log(`      ✅ Common path: ${p}`);
          return true;
        }
        const hasForm = await checkPageForForm(driver);
        if (hasForm) {
          console.log(`      ✅ Form via common path: ${p}`);
          return true;
        }
      } catch (_) {}
    }
    // Go back to base
    await driver.get(baseUrl).catch(() => {});
    await waitForPageReady(driver, 4000);
  } catch (_) {}

  // 6. Try sitemap.xml to find contact page URL
  try {
    const base = new URL(baseUrl);
    const sitemapUrl = `${base.protocol}//${base.host}/sitemap.xml`;
    await driver.get(sitemapUrl);
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
        const navigated = await tryGoTo(driver, u, baseUrl);
        if (!navigated) continue;
        const destUrl = await driver.getCurrentUrl();
        if (isContactUrl(destUrl)) {
          console.log(`      ✅ Found via sitemap: ${u}`);
          return true;
        }
        const hasForm = await checkPageForForm(driver);
        if (hasForm) {
          console.log(`      ✅ Form via sitemap: ${u}`);
          return true;
        }
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
