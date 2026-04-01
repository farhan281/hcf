'use strict';

const fs   = require('fs');
const path = require('path');

const { getNextContact, URL_FILE, OUTPUT_DIR, CSV_FIELDS,
        CAPTCHA_WAIT_TIMEOUT, MAX_CAPTCHA_RETRIES }  = require('./config');
const { makeDriver }                                  = require('./driver_setup');
const { findContactPage }                             = require('./navigator');
const { findContactForm }                             = require('./form_finder');
const { fillAllFields, checkCheckboxes }              = require('./fields');
const { handleCaptcha }                               = require('./captcha/handler');
const { submitForm, detectSuccess }                   = require('./submitter');
const { removeBlockers }                              = require('./form_types');
const { takeDebugScreenshot, saveResults, saveProgress,
        loadProgress, loadExistingResults, clearProgress } = require('./result_tracker');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => Math.random() * (b - a) + a;

// ── Load URLs ─────────────────────────────────────────────────────────────────
if (!fs.existsSync(URL_FILE)) { console.log(`⚠️ ${URL_FILE} not found!`); process.exit(1); }
const urls = fs.readFileSync(URL_FILE, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
console.log(`🧩 Loaded ${urls.length} URLs`);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const startIndex = loadProgress();
if (startIndex) console.log(`▶️  Resuming from URL #${startIndex + 1}`);
const results = startIndex > 0 ? loadExistingResults() : [];

// ── Wait for page to be fully ready ──────────────────────────────────────────
async function waitReady(driver, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await driver.executeScript('return document.readyState') === 'complete') break; }
    catch (_) {}
    await sleep(250);
  }
}

// ── Remove cookie/popup overlays ──────────────────────────────────────────────
async function clearOverlays(driver) {
  try {
    await driver.executeScript(`
      ['[class*="cookie"]','[class*="gdpr"]','[class*="consent"]','[class*="popup"]',
       '[class*="modal"][style*="display: block"]','[id*="cookie"]','[id*="popup"]',
       '#CybotCookiebotDialog','#onetrust-banner-sdk','.cc-window','.pum-overlay']
      .forEach(function(s){
        document.querySelectorAll(s).forEach(function(el){
          var st = window.getComputedStyle(el);
          if(st.position==='fixed'||st.position==='absolute') el.style.display='none';
        });
      });
      document.body.style.overflow='auto';
    `);
  } catch (_) {}
}

// ── Process one URL ───────────────────────────────────────────────────────────
async function processUrl(driver, url, record, contact) {
  // Load page
  const t0 = Date.now();
  await driver.get(url);
  const loadTime = (Date.now() - t0) / 1000;
  record.load_status = 'Loaded';
  record.load_time_s = loadTime.toFixed(1);

  if (loadTime > 20) {
    record.status = 'Skipped'; record.details = `Slow: ${loadTime.toFixed(1)}s`;
    record.load_status = 'Slow'; return;
  }

  // Wait for JS render
  await waitReady(driver, 8000);
  await sleep(rand(2000, 3500));
  await clearOverlays(driver);

  // Step 1: Find contact page
  const onContact = await findContactPage(driver);
  record.contact_page_status = onContact ? 'Opened' : 'Not found';
  await clearOverlays(driver);

  // Step 2: Find form
  const form = await findContactForm(driver);
  if (!form) {
    record.details = 'No contact form detected';
    record.form_status = 'Not found';
    console.log('   ❌ No contact form found');
    return;
  }
  record.form_status = 'Found';

  // Step 3: Scroll form into view
  try { await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', form); }
  catch (_) {}
  await sleep(rand(1200, 2000));

  // Step 4: Fill all fields
  console.log('   📝 Filling form fields...');
  const usedFields = new Set();
  const filled = [], failed = [];
  await fillAllFields(driver, form, contact, usedFields, filled, failed);

  // Retry if critical fields missing
  if (!['full_name','first_name','email'].some(f => filled.includes(f))) {
    console.log('   🔄 Critical fields missing — retrying after scroll...');
    try { await driver.executeScript('window.scrollTo(0, document.body.scrollHeight * 0.4);'); }
    catch (_) {}
    await sleep(rand(800, 1500));
    const rf = [], rfa = [];
    await fillAllFields(driver, form, contact, usedFields, rf, rfa);
    if (rf.length) { filled.push(...rf); console.log(`   ✅ Retry: ${rf.join(', ')}`); }
  }

  console.log(`   ✅ Filled ${filled.length}: [${filled.join(', ')}]`);
  if (failed.length) console.log(`   ℹ️  Not found: [${failed.join(', ')}]`);

  record.fields_filled = String(filled.length);
  record.filled_fields = filled.join(',');
  record.failed_fields = failed.join(',');

  if (!filled.length) {
    record.details = 'No form fields detected'; return;
  }

  // Step 5: Check checkboxes (terms/consent)
  await checkCheckboxes(driver, form);
  await sleep(rand(1500, 2500));

  // Step 6: Handle CAPTCHA
  const captchaResult = await handleCaptcha(driver, record, 'pre-submit', form, CAPTCHA_WAIT_TIMEOUT);
  if (captchaResult === 'blocked' || captchaResult === 'retry') return;
  if (!record.captcha_status) record.captcha_status = 'Not present';

  // Step 7: Submit
  await sleep(rand(1000, 2000));
  const [submitted, lastError] = await submitForm(driver, form, record);

  // Wait for page to respond after submit (thank you, redirect, etc.)
  await sleep(rand(2000, 3000));

  // Step 8: Handle post-submit CAPTCHA (some sites show captcha after submit)
  const postCaptcha = await handleCaptcha(driver, record, 'post-submit', form, CAPTCHA_WAIT_TIMEOUT);
  if (postCaptcha === 'clear' && record.captcha_status && record.captcha_status.includes('post-submit')) {
    // Captcha was present and solved — submit again
    console.log('   🔄 Post-submit captcha solved — resubmitting...');
    await sleep(rand(1000, 2000));
    await submitForm(driver, form, record);
    await sleep(rand(2000, 3000));
  }

  await sleep(rand(1000, 2000));

  if (submitted) {
    console.log('   • Checking submission result...');
    if (await detectSuccess(driver)) {
      const emailFilled = filled.includes('email');
      const nameFilled  = filled.includes('full_name') || filled.includes('first_name');
      const isComplete  = emailFilled && nameFilled;
      record.status  = isComplete ? 'Success' : 'Partial';
      record.details = isComplete
        ? 'Verified thank-you / redirect'
        : `Submitted but missing: ${!emailFilled?'email ':''} ${!nameFilled?'name':''}`.trim();
      record.success_status = 'Success detected';
      console.log(isComplete ? '   ✅ Form submitted successfully!' : `   ⚠️ Partial: ${record.details}`);
    } else {
      record.details = 'Submitted but no confirmation detected';
      record.success_status = 'No confirmation';
      takeDebugScreenshot(driver, 'no_confirm');
    }
  } else {
    if (await detectSuccess(driver)) {
      record.status = 'Success';
      record.details = 'Success detected (submit not tracked)';
      record.success_status = 'Success detected';
    } else {
      record.details = `Submit failed: ${lastError || 'No button found'}`;
      record.success_status = 'No success detected';
      takeDebugScreenshot(driver, 'no_submit');
    }
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
(async () => {
  for (let idx = 0; idx < urls.length; idx++) {
    if (idx < startIndex) continue;

    const url = urls[idx];
    console.log(`\n🟢 [${idx+1}/${urls.length}] ${url}`);

    for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES + 1; attempt++) {
      const record = Object.fromEntries(CSV_FIELDS.map(f => [f, '']));
      record.url    = url;
      record.status = 'Failed';

      const contact = getNextContact();
      console.log(`   👤 ${contact.full_name} <${contact.email}>`);

      const driver = await makeDriver();

      try {
        await processUrl(driver, url, record, contact);
      } catch (e) {
        const msg = e.message || '';
        const isNetwork = ['ERR_NAME_NOT_RESOLVED','ERR_CONNECTION_REFUSED',
          'ERR_CONNECTION_TIMED_OUT','ERR_INTERNET_DISCONNECTED',
          'ERR_ADDRESS_UNREACHABLE','net::ERR_'].some(x => msg.includes(x));
        const isTimeout = msg.includes('timeout') || msg.toLowerCase().includes('page load');

        if (isNetwork) {
          console.log(`   ⏭️ Network error — skipping`);
          record.status = 'Skipped'; record.details = msg.slice(0, 150);
          record.load_status = 'NetworkError';
        } else if (isTimeout) {
          console.log('   ⏭️ Page load timeout');
          record.status = 'Skipped'; record.details = 'Page load timeout';
          record.load_status = 'Timeout';
          try { await driver.executeScript('window.stop();'); } catch (_) {}
        } else {
          console.log(`   ❌ ${e.constructor.name}: ${msg.slice(0, 150)}`);
          record.details = `${e.constructor.name}: ${msg.slice(0, 150)}`;
          takeDebugScreenshot(driver, 'error');
        }
      } finally {
        try { await driver.quit(); } catch (_) {}
      }

      // CAPTCHA retry with fresh Chrome
      const captchaFailed = (record.captcha_status || '').includes('Not solved') ||
                            (record.captcha_status || '').toLowerCase().includes('retry');
      if (captchaFailed && attempt <= MAX_CAPTCHA_RETRIES) {
        console.log(`   🔄 CAPTCHA retry ${attempt}/${MAX_CAPTCHA_RETRIES}...`);
        await sleep(rand(2000, 3500));
        continue;
      }

      results.push(record);
      saveResults(results);
      saveProgress(idx + 1);
      await sleep(rand(3000, 6000));
      break;
    }
  }

  saveResults(results);
  clearProgress();
  console.log(`\n🏁 Done! → ${require('./config').CSV_PATH}`);
})();
