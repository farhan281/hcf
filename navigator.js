// navigator.js
'use strict';

const CONTACT_URL_WORDS = ['contact','get-in-touch','inquiry','enquiry','feedback','reach-us'];

const STRONG_TEXT = [
  'contact us','contact','get in touch','reach us','get in contact',
  'contact form','reach out','write to us','feedback','send us a message',
  'contacto','contáctanos','contactanos','contato','enquire','inquire',
];
const HREF_KEYWORDS  = ['contact','inquiry','enquiry','feedback','reach-us','get-in-touch'];
const BLACKLIST_TEXT = ['about','about us','home','services','portfolio','blog','news',
  'gallery','team','careers','jobs','faq','privacy','terms','sitemap','login',
  'register','shop','store','products','pricing','testimonials','reviews'];
const BLACKLIST_HREF = ['about','javascript','mailto','tel','login','register',
  'shop','cart','checkout','blog','news','gallery','portfolio','careers','jobs'];

// Check if current page already has a usable contact form (with message/textarea)
const HAS_CONTACT_FORM_JS = `
(function() {
  var forms = Array.from(document.querySelectorAll('form') || []);
  for (var i = 0; i < forms.length; i++) {
    var f = forms[i];
    var hasTextarea = !!f.querySelector('textarea');
    var hasEmail    = !!f.querySelector(
      'input[type=email],[name*=email i],[id*=email i],[placeholder*=email i]');
    var visible = Array.from(f.querySelectorAll('input,textarea,select'))
      .filter(function(e){ return e.offsetParent !== null && e.type !== 'hidden'; }).length;
    var snippet = (f.id+' '+f.className+' '+(f.innerHTML||'').substring(0,1000)).toLowerCase();
    var isPw = !!f.querySelector('input[type=password]');
    var isSearch = snippet.indexOf('search') !== -1 && !hasEmail;
    if (isPw || isSearch) continue;
    if ((hasTextarea || hasEmail) && visible >= 2) return true;
  }
  // Formless inputs with email + textarea
  var emails = Array.from(document.querySelectorAll(
    'input[type=email],[name*=email i],[placeholder*=email i]'
  )).filter(function(e){ return e.offsetParent !== null; });
  var tas = Array.from(document.querySelectorAll('textarea'))
    .filter(function(e){ return e.offsetParent !== null; });
  return emails.length > 0 && tas.length > 0;
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
    if (blackText.some(function(b){ return text === b || text.startsWith(b+' '); })) return;
    if (blackHref.some(function(b){ return hrefL.indexOf('/'+b) !== -1; })) return;
    var score = 0;
    strongKws.forEach(function(k) {
      if (text === k) score += 20;
      else if (text.indexOf(k) !== -1) score += 8;
    });
    if (hrefKws.some(function(k){ return hrefL.indexOf(k) !== -1; })) score += 5;
    if (score > 0 && !seen.has(href)) {
      seen.add(href);
      scored.push({ href: href, label: text || href, score: score });
    }
  });
  scored.sort(function(a,b){ return b.score - a.score; });
  return scored.slice(0, 5).map(function(s){ return [s.href, s.label, s.score]; });
})(arguments[0], arguments[1], arguments[2], arguments[3]);
`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForPageReady(driver, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const state = await driver.executeScript('return document.readyState');
      if (state === 'complete') return;
    } catch (_) {}
    await sleep(200);
  }
}

function isContactUrl(url) {
  return CONTACT_URL_WORDS.some(w => url.toLowerCase().includes(w));
}

async function findContactPage(driver) {
  console.log('   🔎 Looking for contact page...');
  const baseUrl = await driver.getCurrentUrl();

  // 1. Already on contact URL?
  if (isContactUrl(baseUrl)) {
    console.log('      ✅ Already on contact page (URL match)');
    return true;
  }

  // 2. Current page already has a contact form with message field? Use it directly
  try {
    const hasForm = await driver.executeScript(HAS_CONTACT_FORM_JS);
    if (hasForm) {
      console.log('      ✅ Contact form found on current page');
      return true;
    }
  } catch (_) {}

  // 3. Look for contact page link
  let candidates = [];
  try {
    candidates = await driver.executeScript(
      SCAN_LINKS_JS, STRONG_TEXT, HREF_KEYWORDS, BLACKLIST_TEXT, BLACKLIST_HREF
    ) || [];
  } catch (_) {}

  if (candidates.length) {
    console.log(`      🔗 Candidates: ${candidates.map(c => `"${c[1]}"(${c[2]})`).join(', ')}`);
  }

  for (const [href, label, score] of candidates) {
    try {
      let absUrl = href;
      if (!href.startsWith('http')) {
        const u = new URL(baseUrl);
        absUrl = `${u.protocol}//${u.host}${href.startsWith('/') ? href : '/' + href}`;
      }
      const u1 = new URL(absUrl), u2 = new URL(baseUrl);
      if (u1.pathname === u2.pathname && u1.host === u2.host) continue;
      if (BLACKLIST_HREF.some(b => absUrl.toLowerCase().includes('/' + b))) continue;

      await driver.get(absUrl);
      await waitForPageReady(driver, 6000);
      const destUrl = await driver.getCurrentUrl();

      // Verify destination has a contact form with message field
      const destHasForm = await driver.executeScript(HAS_CONTACT_FORM_JS).catch(() => false);
      if (isContactUrl(destUrl) || destHasForm) {
        console.log(`      ✅ Navigated to: "${label}" (score=${score})`);
        return true;
      }

      console.log(`      ⚠️ "${label}" has no contact form — going back`);
      await driver.navigate().back();
      await waitForPageReady(driver, 4000);
    } catch (_) {}
  }

  console.log('      ℹ️ No contact page found, using current page');
  return false;
}

module.exports = { findContactPage };
