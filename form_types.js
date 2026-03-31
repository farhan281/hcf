// form_types.js
// Handles ALL contact form types found on the web:
//
// TYPE 1: Native HTML <form> — standard, WordPress, custom
// TYPE 2: WordPress plugins — WPForms, CF7, Gravity Forms, Ninja Forms, Formidable
// TYPE 3: Third-party embeds — HubSpot, Typeform, JotForm, Cognito, Formstack
// TYPE 4: SPA/React/Vue/Angular — no <form> tag, inputs outside form
// TYPE 5: Multi-step forms — wizard style, next/prev buttons
// TYPE 6: Iframe-embedded forms — form inside iframe
// TYPE 7: Shadow DOM forms — web components
// TYPE 8: Elementor/Divi/Beaver Builder page builder forms

'use strict';

const { By } = require('selenium-webdriver');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Detect form type from page ────────────────────────────────────────────────
async function detectFormType(driver) {
  try {
    return await driver.executeScript(`
      var html = document.documentElement.innerHTML.toLowerCase();
      var url  = window.location.href.toLowerCase();

      // WordPress plugins
      if (html.indexOf('wpcf7') !== -1 || html.indexOf('contact-form-7') !== -1)
        return 'cf7';
      if (html.indexOf('wpforms') !== -1 || html.indexOf('wpforms-form') !== -1)
        return 'wpforms';
      if (html.indexOf('gform_wrapper') !== -1 || html.indexOf('gravityforms') !== -1)
        return 'gravity';
      if (html.indexOf('nf-form') !== -1 || html.indexOf('ninja-forms') !== -1)
        return 'ninja';
      if (html.indexOf('frm_form') !== -1 || html.indexOf('formidable') !== -1)
        return 'formidable';
      if (html.indexOf('elementor-form') !== -1)
        return 'elementor';

      // Third-party embeds
      if (html.indexOf('hsforms') !== -1 || html.indexOf('hubspot') !== -1 ||
          html.indexOf('hs-form') !== -1)
        return 'hubspot';
      if (html.indexOf('typeform') !== -1)
        return 'typeform';
      if (html.indexOf('jotform') !== -1)
        return 'jotform';
      if (html.indexOf('formstack') !== -1)
        return 'formstack';
      if (html.indexOf('cognito') !== -1 && html.indexOf('form') !== -1)
        return 'cognito';
      if (html.indexOf('pardot') !== -1)
        return 'pardot';

      // Multi-step
      var forms = document.querySelectorAll('form');
      for (var i=0; i<forms.length; i++) {
        var f = forms[i];
        if (f.querySelector('[data-step],[data-page],[class*="step"],[class*="wizard"],[class*="multi"]'))
          return 'multistep';
      }

      // SPA/Formless
      var inputs = document.querySelectorAll('input:not([type=hidden]),textarea');
      var outsideForm = Array.from(inputs).filter(function(el){
        return el.offsetParent !== null && !el.closest('form');
      });
      if (outsideForm.length >= 2) return 'formless';

      // Standard HTML form
      if (document.querySelector('form')) return 'standard';

      return 'unknown';
    `);
  } catch (_) { return 'unknown'; }
}

// ── Wait for dynamic form to appear ──────────────────────────────────────────
async function waitForForm(driver, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const found = await driver.executeScript(`
        var forms = document.querySelectorAll('form');
        var inputs = document.querySelectorAll('input[type=email],input[type=text],textarea');
        return forms.length > 0 || inputs.length >= 2;
      `);
      if (found) return true;
    } catch (_) {}
    await sleep(400);
  }
  return false;
}

// ── Handle HubSpot forms (loaded via JS SDK) ──────────────────────────────────
async function waitForHubspot(driver, timeout = 8000) {
  console.log('      🔄 Waiting for HubSpot form to load...');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const ready = await driver.executeScript(`
        return !!document.querySelector('.hs-form,form.hs-form,[class*="hs-form"] input');
      `);
      if (ready) { console.log('      ✅ HubSpot form loaded'); return true; }
    } catch (_) {}
    await sleep(500);
  }
  return false;
}

// ── Handle Typeform (iframe-based) ────────────────────────────────────────────
async function findTypeformIframe(driver) {
  try {
    const iframes = await driver.findElements(By.css('iframe[src*="typeform"]'));
    if (iframes.length) {
      console.log('      📋 Typeform iframe detected');
      return iframes[0];
    }
  } catch (_) {}
  return null;
}

// ── Handle JotForm (iframe-based) ─────────────────────────────────────────────
async function findJotformIframe(driver) {
  try {
    const iframes = await driver.findElements(By.css('iframe[src*="jotform"]'));
    if (iframes.length) {
      console.log('      📋 JotForm iframe detected');
      return iframes[0];
    }
  } catch (_) {}
  return null;
}

// ── Handle multi-step forms ───────────────────────────────────────────────────
async function isMultiStep(form, driver) {
  try {
    return await driver.executeScript(`
      var f = arguments[0];
      return !!(f.querySelector('[data-step],[data-page],[class*="step"],[class*="wizard"]') ||
                f.querySelectorAll('[class*="page"],[class*="slide"]').length > 1);
    `, form);
  } catch (_) { return false; }
}

async function clickNextStep(driver) {
  try {
    const clicked = await driver.executeScript(`
      var btns = Array.from(document.querySelectorAll('button,input[type=button],[role=button]'));
      var next = btns.find(function(b){
        var t = (b.innerText||b.value||b.getAttribute('aria-label')||'').toLowerCase();
        return t.indexOf('next') !== -1 || t.indexOf('continue') !== -1 ||
               t.indexOf('proceed') !== -1 || t.indexOf('forward') !== -1;
      });
      if (next && next.offsetParent !== null) { next.click(); return true; }
      return false;
    `);
    if (clicked) {
      console.log('      ➡️ Clicked Next step');
      await sleep(1000);
      return true;
    }
  } catch (_) {}
  return false;
}

// ── Scroll form into view and trigger lazy load ───────────────────────────────
async function scrollAndReveal(driver) {
  try {
    await driver.executeScript(`
      // Scroll to middle of page to trigger lazy-loaded forms
      window.scrollTo(0, document.body.scrollHeight * 0.4);
    `);
    await sleep(800);
    await driver.executeScript(`window.scrollTo(0, 0);`);
    await sleep(300);
  } catch (_) {}
}

// ── Remove overlays/popups that block form ────────────────────────────────────
async function removeBlockers(driver) {
  try {
    await driver.executeScript(`
      // Remove cookie banners, popups, overlays
      var sels = [
        '[class*="cookie"]','[class*="gdpr"]','[class*="consent"]',
        '[class*="popup"]','[class*="modal"]','[class*="overlay"]',
        '[id*="cookie"]','[id*="popup"]','[id*="modal"]',
        '.pum-overlay','.mfp-overlay','.fancybox-overlay',
        '#CybotCookiebotDialog','#onetrust-banner-sdk',
        '.cc-window','.cookie-notice',
      ];
      sels.forEach(function(s){
        document.querySelectorAll(s).forEach(function(el){
          // Only remove if it's blocking (fixed/absolute positioned)
          var style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'absolute') {
            el.style.display = 'none';
          }
        });
      });
      // Restore body scroll
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    `);
  } catch (_) {}
}

// ── Find form considering all types ──────────────────────────────────────────
async function findFormAllTypes(driver) {
  // Remove blockers first
  await removeBlockers(driver);

  const formType = await detectFormType(driver);
  console.log(`      📋 Form type detected: ${formType}`);

  // Handle special types
  switch (formType) {
    case 'hubspot':
      await waitForHubspot(driver);
      break;
    case 'typeform': {
      const iframe = await findTypeformIframe(driver);
      if (iframe) {
        try {
          await driver.switchTo().frame(iframe);
          console.log('      📋 Switched into Typeform iframe');
          return { type: 'typeform', form: null, inIframe: true };
        } catch (_) {}
      }
      break;
    }
    case 'jotform': {
      const iframe = await findJotformIframe(driver);
      if (iframe) {
        try {
          await driver.switchTo().frame(iframe);
          console.log('      📋 Switched into JotForm iframe');
          return { type: 'jotform', form: null, inIframe: true };
        } catch (_) {}
      }
      break;
    }
    case 'unknown':
      // Scroll to trigger lazy load
      await scrollAndReveal(driver);
      await waitForForm(driver, 4000);
      break;
  }

  return { type: formType, form: null, inIframe: false };
}

module.exports = {
  detectFormType,
  waitForForm,
  waitForHubspot,
  findTypeformIframe,
  findJotformIframe,
  isMultiStep,
  clickNextStep,
  scrollAndReveal,
  removeBlockers,
  findFormAllTypes,
};
