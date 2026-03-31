'use strict';

const { By } = require('selenium-webdriver');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const SKIP_IFRAME_SRC = [
  'google-analytics','googletagmanager','facebook.com/plugins',
  'twitter.com/widgets','youtube.com','maps.google','recaptcha',
  'captcha','doubleclick','ads.','google.com/maps',
];

const CONTACT_URL_WORDS = [
  'contact','get-in-touch','inquiry','enquiry','feedback','reach',
  'appointment','schedule','book','consult','new-patient','patient','request','quote','touch',
];

async function clearOverlays(driver) {
  try {
    await driver.executeScript(`
      ['[class*="cookie"]','[class*="gdpr"]','[class*="consent"]','[class*="popup"]',
       '[id*="cookie"]','[id*="popup"]','#CybotCookiebotDialog','#onetrust-banner-sdk',
       '.cc-window','.pum-overlay','[class*="notice"]','[class*="banner"]',
       '[class*="overlay"]:not([class*="form"])'].forEach(function(s){
        document.querySelectorAll(s).forEach(function(el){
          var st=window.getComputedStyle(el);
          if(st.position==='fixed'||st.position==='absolute'||st.position==='sticky')
            el.style.display='none';
        });
      });
      document.body.style.overflow='auto';
      document.documentElement.style.overflow='auto';
    `);
  } catch (_) {}
}

// Score a form element — higher = more likely contact form
const SCORE_FORMS_JS = `
(function() {
  var PLUGINS = ['wpcf7','wpforms','gform','gravityform','ninja-form','formidable',
                 'elementor-form','hs-form','hubspot','contact-form','cf7','nf-form',
                 'frm-form','mc4wp','mailchimp','fluentform','fluent-form'];
  var url = window.location.href.toLowerCase();
  var onContact = ['contact','inquiry','enquiry','feedback','reach','touch',
    'appointment','schedule','book','consult','new-patient','patient','request','quote']
    .some(function(w){ return url.indexOf(w) !== -1; });

  return Array.from(document.querySelectorAll('form') || []).map(function(f, i) {
    var inputs = Array.from(f.querySelectorAll('input,textarea,select'));
    var visible = inputs.filter(function(e) {
      return e.offsetParent !== null && e.type !== 'hidden' &&
             e.type !== 'submit' && e.type !== 'button' && e.type !== 'image' && e.type !== 'reset';
    });
    var html = (f.outerHTML || '').toLowerCase().substring(0, 6000);
    var hasEmail    = !!f.querySelector('input[type=email],[name*=email i],[id*=email i],[placeholder*=email i]');
    var hasTextarea = !!f.querySelector('textarea:not([name*=recaptcha i]):not([id*=recaptcha i])');
    var hasName     = !!f.querySelector('[name*=name i],[id*=name i],[placeholder*=name i]');
    var hasPhone    = !!f.querySelector('input[type=tel],[name*=phone i],[name*=mobile i],[id*=phone i],[placeholder*=phone i]');
    var hasMsg      = !!f.querySelector('[name*=message i],[name*=comment i],[name*=subject i],[id*=message i],[placeholder*=message i],[placeholder*=subject i]');
    var hasSubmit   = !!f.querySelector('button[type=submit],input[type=submit],button:not([type]),input[type=button]');
    var hasPassword = !!f.querySelector('input[type=password]');
    var fid = (f.id||'').toLowerCase();
    var fcls = (f.className||'').toLowerCase();
    var isSearch = (fid.indexOf('search') !== -1 || fcls.indexOf('search') !== -1 ||
                    html.indexOf('type="search"') !== -1 || html.indexOf("type='search'") !== -1) &&
                   !hasEmail && !hasTextarea && !hasMsg;
    var isLogin  = (fid.indexOf('login') !== -1 || fcls.indexOf('login') !== -1 ||
                    html.indexOf('login') !== -1 || html.indexOf('sign-in') !== -1 ||
                    html.indexOf('signin') !== -1) && hasPassword;
    var isPlugin = PLUGINS.some(function(p){ return html.indexOf(p) !== -1; });
    var score = 0;
    if (hasEmail)    score += 35;
    if (hasTextarea) score += 30;
    if (hasMsg)      score += 20;
    if (hasName)     score += 15;
    if (hasPhone)    score += 15;
    if (hasSubmit)   score += 10;
    if (visible.length >= 4) score += 15;
    else if (visible.length >= 3) score += 10;
    else if (visible.length >= 2) score += 5;
    else if (visible.length >= 1) score += 2;
    if (isPlugin)    score += 25;
    if (onContact)   score += 25;
    // Plugin form with multiple visible inputs is almost certainly a contact form
    if (isPlugin && visible.length >= 3) score += 20;
    if (hasPassword) score -= 60;
    if (isSearch)    score -= 50;
    if (isLogin)     score -= 60;
    return { idx: i, score: score, visible: visible.length,
             hasEmail, hasTextarea, hasName, hasPhone, hasMsg,
             hasSubmit, hasPassword, isSearch, isLogin };
  });
})();
`;

// Find formless contact section (React/Vue/Angular SPAs)
const FORMLESS_JS = `
(function() {
  var inputs = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button])' +
    ':not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password]),' +
    'textarea'
  )).filter(function(el){ return el.offsetParent !== null && !el.closest('form'); });
  if (inputs.length < 2) return null;
  var hasEmail = inputs.some(function(el){
    return el.type==='email' ||
           (el.name+' '+el.id+' '+(el.placeholder||'')).toLowerCase().indexOf('email') !== -1;
  });
  var hasTa  = inputs.some(function(el){ return el.tagName.toLowerCase()==='textarea'; });
  var hasMsg = inputs.some(function(el){
    return (el.name+' '+el.id+' '+(el.placeholder||'')).toLowerCase()
      .match(/message|comment|subject|inquiry|enquiry/);
  });
  var hasName = inputs.some(function(el){
    return (el.name+' '+el.id+' '+(el.placeholder||'')).toLowerCase().match(/name|first|last/);
  });
  if (!hasEmail && !hasTa && !hasMsg) return null;
  // Find common ancestor
  function ancestors(el){ var a=[]; while(el){ a.push(el); el=el.parentElement; } return a; }
  var sets = inputs.map(ancestors);
  var common = sets[0].find(function(a){ return sets.every(function(s){ return s.indexOf(a)!==-1; }); });
  return common || document.body;
})();
`;

// Check if a modal/popup has a contact form
const MODAL_FORM_JS = `
(function() {
  var modalSelectors = [
    '[class*="modal"][style*="display: block"]',
    '[class*="modal"].active','[class*="modal"].open','[class*="modal"].show',
    '[class*="popup"].active','[class*="popup"].open','[class*="popup"].show',
    '[class*="dialog"][open]','dialog[open]',
    '[role="dialog"]','[aria-modal="true"]',
    '.mfp-content','#colorbox','.fancybox-content',
  ];
  for (var i=0; i<modalSelectors.length; i++) {
    var modals = document.querySelectorAll(modalSelectors[i]);
    for (var j=0; j<modals.length; j++) {
      var m = modals[j];
      if (m.offsetParent === null) continue;
      var f = m.querySelector('form');
      if (f) {
        var hasEmail = !!f.querySelector('input[type=email],[name*=email i]');
        var hasTa    = !!f.querySelector('textarea');
        var visible  = Array.from(f.querySelectorAll('input,textarea,select'))
          .filter(function(e){ return e.offsetParent!==null && e.type!=='hidden'; }).length;
        if (visible >= 1 && (hasEmail || hasTa)) return f;
      }
    }
  }
  return null;
})();
`;

// Try to open contact form via button/link on page (for sites with "Contact Us" button that opens modal)
const FIND_CONTACT_TRIGGER_JS = `
(function() {
  var kws = ['contact us','contact','get in touch','reach us','send message',
             'book appointment','schedule','request appointment','free consultation',
             'inquire','enquire','write to us','message us','email us'];
  var els = Array.from(document.querySelectorAll('a,button,[role=button],[class*=btn]'));
  for (var i=0; i<els.length; i++) {
    var el = els[i];
    if (el.offsetParent === null) continue;
    var text = (el.innerText||el.textContent||'').trim().toLowerCase();
    var href = (el.getAttribute('href')||'').toLowerCase();
    // Skip external links
    if (href.startsWith('http') && href.indexOf(window.location.hostname) === -1) continue;
    // Skip anchor links that go to another page
    if (href.startsWith('http') && !href.includes('#')) continue;
    if (kws.some(function(k){ return text === k || text.indexOf(k) !== -1; })) {
      return el;
    }
  }
  return null;
})();
`;

async function scoreAndPickForm(driver, allForms, formData) {
  formData.sort((a, b) => b.score - a.score);
  console.log(`      Found ${allForms.length} form(s):`);
  formData.forEach(f => {
    console.log(`        Form ${f.idx+1}: score=${f.score} email=${f.hasEmail} textarea=${f.hasTextarea} name=${f.hasName} phone=${f.hasPhone} visible=${f.visible}`);
  });
  for (const f of formData) {
    if (f.hasPassword || f.isSearch || f.isLogin) continue;
    if (f.score > 0 && (f.hasEmail || f.hasTextarea || f.hasMsg || (f.hasName && f.hasPhone) || f.visible >= 2)) {
      const form = allForms[f.idx];
      if (form) {
        console.log(`      ✅ Selected form ${f.idx+1} (score=${f.score})`);
        return form;
      }
    }
  }
  return null;
}

async function findContactForm(driver) {
  console.log('   🔍 Searching for contact form...');
  await clearOverlays(driver);

  for (let pass = 1; pass <= 4; pass++) {
    if (pass === 2) {
      // Scroll to middle — triggers lazy-loaded forms
      try { await driver.executeScript('window.scrollTo(0, document.body.scrollHeight * 0.4)'); } catch (_) {}
      await sleep(1000);
      await clearOverlays(driver);
    } else if (pass === 3) {
      // Scroll to bottom
      try { await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)'); } catch (_) {}
      await sleep(1000);
      try { await driver.executeScript('window.scrollTo(0, 0)'); } catch (_) {}
      await sleep(500);
    } else if (pass === 4) {
      // Try clicking a contact trigger button (opens modal/popup)
      try {
        const trigger = await driver.executeScript(FIND_CONTACT_TRIGGER_JS);
        if (trigger) {
          console.log('      🖱️ Clicking contact trigger...');
          await driver.executeScript('arguments[0].click()', trigger);
          await sleep(1500);
          await clearOverlays(driver);
        }
      } catch (_) {}
    } else {
      if (pass > 1) await sleep(pass * 800);
    }

    // ── 1. Standard <form> tags ──────────────────────────────────────────────
    let allForms = [], formData = [];
    try {
      allForms = await driver.findElements(By.tagName('form'));
      if (allForms.length > 0) {
        formData = await driver.executeScript(SCORE_FORMS_JS) || [];
      }
    } catch (_) {}

    if (formData.length > 0 && allForms.length > 0) {
      const picked = await scoreAndPickForm(driver, allForms, formData);
      if (picked) return picked;
    }

    // ── 2. Modal/popup form ──────────────────────────────────────────────────
    try {
      const modalForm = await driver.executeScript(MODAL_FORM_JS);
      if (modalForm) {
        console.log('      ✅ Found form in modal/popup');
        return modalForm;
      }
    } catch (_) {}

    // ── 3. Iframes ───────────────────────────────────────────────────────────
    try {
      const iframes = await driver.findElements(By.tagName('iframe'));
      for (const iframe of iframes) {
        const src = (await iframe.getAttribute('src').catch(() => '') || '').toLowerCase();
        if (SKIP_IFRAME_SRC.some(s => src.includes(s))) continue;
        if (!(await iframe.isDisplayed().catch(() => false))) continue;
        try {
          await driver.switchTo().frame(iframe);
          const iForms = await driver.findElements(By.tagName('form')).catch(() => []);
          const iData  = await driver.executeScript(SCORE_FORMS_JS).catch(() => []) || [];
          if (iForms.length && iData.length) {
            const picked = await scoreAndPickForm(driver, iForms, iData);
            if (picked) {
              console.log('      ✅ Found form in iframe');
              return picked;
            }
          }
          await driver.switchTo().defaultContent();
        } catch (_) {
          await driver.switchTo().defaultContent().catch(() => {});
        }
      }
    } catch (_) {}

    // ── 4. Formless SPA (React/Vue/Angular) ─────────────────────────────────
    try {
      const formless = await driver.executeScript(FORMLESS_JS);
      if (formless) {
        console.log('      ✅ Found formless contact section');
        return formless;
      }
    } catch (_) {}

    // ── 5. Shadow DOM ────────────────────────────────────────────────────────
    try {
      const shadowForm = await driver.executeScript(`
        function searchShadow(root) {
          var els = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (var i=0; i<els.length; i++) {
            if (els[i].shadowRoot) {
              var f = els[i].shadowRoot.querySelector('form');
              if (f) {
                var hasEmail = !!f.querySelector('input[type=email],[name*=email i]');
                var hasTa    = !!f.querySelector('textarea');
                var visible  = Array.from(f.querySelectorAll('input,textarea,select'))
                  .filter(function(e){ return e.type!=='hidden'; }).length;
                if (visible >= 1 && (hasEmail || hasTa)) return f;
              }
            }
          }
          return null;
        }
        return searchShadow(document);
      `);
      if (shadowForm) {
        console.log('      ✅ Found form in Shadow DOM');
        return shadowForm;
      }
    } catch (_) {}

    if (pass < 4) console.log(`      ⏳ Pass ${pass}/4 — retrying...`);
  }

  console.log('      ❌ No contact form found');
  return null;
}

module.exports = { findContactForm };
