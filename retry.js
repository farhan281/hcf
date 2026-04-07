'use strict';

// ── retry.js ──────────────────────────────────────────────────────────────────
// • Reads contact_results.csv  → picks failed/skipped/no-form URLs
// • Skips URLs already done in retry_results.csv (Success / Partial)
// • Resume: saves progress index → Ctrl+C safe, restart continues from last URL
// • Every URL result (pass or fail) appended to retry_results.csv immediately
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const { getNextContact, OUTPUT_DIR, CSV_FIELDS,
        CAPTCHA_WAIT_TIMEOUT, MAX_CAPTCHA_RETRIES } = require('./config');
const { makeDriver }          = require('./driver_setup');
const { findContactPage }     = require('./navigator');
const { findContactForm }     = require('./form_finder');
const { fillAllFields, checkCheckboxes } = require('./fields');
const { handleCaptcha }       = require('./captcha/handler');
const { submitForm, detectSuccess } = require('./submitter');
const { removeBlockers, clickNextStep, isMultiStep } = require('./form_types');
const { takeDebugScreenshot } = require('./result_tracker');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => Math.floor(Math.random() * (b - a) + a);

// ── File paths ────────────────────────────────────────────────────────────────
const MAIN_CSV      = path.join(__dirname, OUTPUT_DIR, 'contact_results.csv');
const RETRY_CSV     = path.join(__dirname, OUTPUT_DIR, 'retry_results.csv');
const RETRY_PROG    = path.join(__dirname, OUTPUT_DIR, 'retry_progress.txt');
const RETRY_SKIP    = path.join(__dirname, OUTPUT_DIR, 'retry_skipped.txt');

const SHEETS_URL    = process.env.GOOGLE_SHEETS_URL ||
  'https://script.google.com/macros/s/AKfycbwZFu9gSUV0yo571sUsTKQtK4Gmnis9icSX1m6WF7JtVLcMgmgOPyiXTdMpkVnWwdyzuQ/exec';

function sendToRetrySheet(record) {
  if (!SHEETS_URL) return;
  const row = CSV_FIELDS.map(f => record[f] || '');
  fetch(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'retry', rows: [row] }),
  }).catch(() => {});
}

// ── Statuses that qualify for retry ──────────────────────────────────────────
const RETRY_STATUSES  = new Set(['failed', 'skipped', 'partial']);
const RETRY_DETAILS   = [
  'no contact form','no form','not found','no confirmation',
  'submit failed','no submit','timeout','networkerror',
  'captcha','no form fields','network',
];
// Statuses considered "done" — skip on resume
const DONE_STATUSES   = new Set(['success', 'partial']);

// ── CSV helpers ───────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const fields = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
    else cur += c;
  }
  fields.push(cur);
  return fields;
}

function escapeCsv(val) {
  const s = String(val == null ? '' : val).replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ── Load URLs that need retry from main CSV ───────────────────────────────────
function loadFailedUrls() {
  if (!fs.existsSync(MAIN_CSV)) { console.log(`⚠️  CSV not found: ${MAIN_CSV}`); return []; }

  const lines = fs.readFileSync(MAIN_CSV, 'utf8').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const hdrs    = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const urlIdx  = hdrs.indexOf('url');
  const stIdx   = hdrs.indexOf('status');
  const dtIdx   = hdrs.indexOf('details');
  const fmIdx   = hdrs.indexOf('form_status');
  if (urlIdx === -1) { console.log('⚠️  No "url" column'); return []; }

  const seen = new Set();
  const out  = [];
  for (let i = 1; i < lines.length; i++) {
    const c   = parseCsvLine(lines[i]);
    const url = (c[urlIdx] || '').trim();
    const st  = (c[stIdx]  || '').trim().toLowerCase();
    const dt  = (c[dtIdx]  || '').trim().toLowerCase();
    const fm  = (c[fmIdx]  || '').trim().toLowerCase();
    if (!url || !url.startsWith('http') || seen.has(url)) continue;
    const need = RETRY_STATUSES.has(st) || fm === 'not found' ||
                 RETRY_DETAILS.some(p => dt.includes(p));
    if (need) { seen.add(url); out.push({ url, status: st, details: dt }); }
  }
  return out;
}

// ── Load already-done URLs from retry_results.csv ────────────────────────────
function loadDoneUrls() {
  const done = new Set();
  if (!fs.existsSync(RETRY_CSV)) return done;
  try {
    const lines = fs.readFileSync(RETRY_CSV, 'utf8').split('\n').filter(Boolean);
    if (lines.length < 2) return done;
    const hdrs   = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const urlIdx = hdrs.indexOf('url');
    const stIdx  = hdrs.indexOf('status');
    if (urlIdx === -1) return done;
    for (let i = 1; i < lines.length; i++) {
      const c   = parseCsvLine(lines[i]);
      const url = (c[urlIdx] || '').trim();
      const st  = (c[stIdx]  || '').trim().toLowerCase();
      if (url && DONE_STATUSES.has(st)) done.add(url);
    }
  } catch (_) {}
  return done;
}

// ── Progress: save / load index ───────────────────────────────────────────────
function saveProgress(idx) {
  try { fs.writeFileSync(RETRY_PROG, String(idx), 'utf8'); } catch (_) {}
}
function loadProgress() {
  try {
    if (fs.existsSync(RETRY_PROG)) {
      const v = fs.readFileSync(RETRY_PROG, 'utf8').trim();
      if (/^\d+$/.test(v)) return parseInt(v, 10);
    }
  } catch (_) {}
  return 0;
}
function clearProgress() {
  try { if (fs.existsSync(RETRY_PROG)) fs.unlinkSync(RETRY_PROG); } catch (_) {}
}

// ── Append one record to retry_results.csv ───────────────────────────────────
function appendRecord(record) {
  const row = CSV_FIELDS.map(f => escapeCsv(record[f] || '')).join(',');
  if (!fs.existsSync(RETRY_CSV)) {
    fs.writeFileSync(RETRY_CSV, CSV_FIELDS.join(',') + '\n', 'utf8');
  }
  fs.appendFileSync(RETRY_CSV, row + '\n', 'utf8');
}

// ── Selenium helpers ──────────────────────────────────────────────────────────
async function waitReady(driver, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await driver.executeScript('return document.readyState') === 'complete') break; }
    catch (_) {}
    await sleep(300);
  }
}

async function clearOverlays(driver) {
  try {
    await driver.executeScript(`
      ['[class*="cookie"]','[class*="gdpr"]','[class*="consent"]','[class*="popup"]',
       '[class*="modal"][style*="display: block"]','[id*="cookie"]','[id*="popup"]',
       '#CybotCookiebotDialog','#onetrust-banner-sdk','.cc-window','.pum-overlay']
      .forEach(function(s){
        document.querySelectorAll(s).forEach(function(el){
          var st=window.getComputedStyle(el);
          if(st.position==='fixed'||st.position==='absolute') el.style.display='none';
        });
      });
      document.body.style.overflow='auto';
    `);
  } catch (_) {}
}

async function waitForJsForm(driver, maxMs = 12000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const found = await driver.executeScript(`
      var forms=document.querySelectorAll('form');
      if(forms.length){
        for(var i=0;i<forms.length;i++){
          var vis=Array.from(forms[i].querySelectorAll('input,textarea'))
            .filter(function(e){return e.offsetParent!==null&&e.type!=='hidden';});
          if(vis.length>=2) return true;
        }
      }
      var inp=Array.from(document.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]),textarea'
      )).filter(function(e){return e.offsetParent!==null;});
      return inp.length>=2;
    `).catch(() => false);
    if (found) return true;
    await sleep(600);
  }
  return false;
}

async function aggressiveScroll(driver) {
  try {
    for (const pct of [0.3, 0.6, 1.0, 0]) {
      await driver.executeScript(`window.scrollTo(0,document.body.scrollHeight*${pct})`);
      await sleep(700);
    }
  } catch (_) {}
}

async function findShadowForm(driver) {
  try {
    return await driver.executeScript(`
      function walk(root){
        var all=root.querySelectorAll('*');
        for(var i=0;i<all.length;i++){
          if(all[i].shadowRoot){
            var f=all[i].shadowRoot.querySelector('form');
            if(f) return f;
            var d=walk(all[i].shadowRoot);
            if(d) return d;
          }
        }
        return null;
      }
      return walk(document);
    `);
  } catch (_) { return null; }
}

async function handleMultiStep(driver, form, contact, record) {
  const usedFields = new Set();
  const filled = [], failed = [];
  let stepCount = 0;
  while (stepCount < 6) {
    stepCount++;
    console.log(`      📋 Multi-step: step ${stepCount}...`);
    await fillAllFields(driver, form, contact, usedFields, filled, failed);
    await checkCheckboxes(driver, form);
    await sleep(rand(600, 1000));
    const moved = await clickNextStep(driver);
    if (!moved) break;
    await sleep(rand(1200, 2000));
    try {
      const forms = await driver.findElements(require('selenium-webdriver').By.tagName('form'));
      if (forms.length) form = forms[0];
    } catch (_) {}
  }
  record.fields_filled = String(filled.length);
  record.filled_fields = filled.join(',');
  record.failed_fields = failed.join(',');
  return { filled, failed, form };
}

// ── Core: process one URL ─────────────────────────────────────────────────────
async function retryUrl(driver, url, record, contact, originalStatus) {
  console.log(`   🔁 Retry: ${url}`);
  console.log(`   📋 Original: ${originalStatus}`);

  const t0 = Date.now();
  try { await driver.get(url); }
  catch (e) {
    const msg = e.message || '';
    // Renderer timeout — page may be partially loaded, try to continue
    if (msg.includes('Timed out receiving message from renderer') ||
        msg.includes('timeout') && msg.includes('renderer')) {
      console.log('   ⚠️ Renderer timeout — stopping load and continuing...');
      try { await driver.executeScript('window.stop();'); } catch (_) {}
      await sleep(1000);
      // Check if page has any content
      const hasContent = await driver.executeScript(
        'return document.body && document.body.innerText.length > 100'
      ).catch(() => false);
      if (!hasContent) {
        record.status = 'Skipped';
        record.details = 'Renderer timeout — no content loaded';
        record.load_status = 'Timeout';
        return;
      }
      console.log('   ✅ Page partially loaded — proceeding...');
    } else {
      record.status = 'Skipped';
      record.details = `Load error: ${msg.slice(0, 120)}`;
      record.load_status = 'Error';
      return;
    }
  }

  const loadTime = (Date.now() - t0) / 1000;
  record.load_time_s = loadTime.toFixed(1);
  if (loadTime > 25) {
    record.status = 'Skipped'; record.details = `Slow: ${loadTime.toFixed(1)}s`;
    record.load_status = 'Slow'; return;
  }
  record.load_status = 'Loaded';

  // ── HTTP error check — IMMEDIATELY after load, before any waiting ────────────────
  const httpSkip = await driver.executeScript(`
    (function(){
      var title = document.title.toLowerCase();
      var body  = (document.body ? document.body.innerText : '').toLowerCase().slice(0, 500);
      var bad   = ['404','page not found','not found','error 404','410','gone',
                   '403','forbidden','access denied','500','server error','503',
                   'service unavailable','this page does not exist',
                   'page cannot be found','no longer exists','has been removed'];
      if (bad.some(function(t){ return title.includes(t); })) return 'title:' + title.slice(0,40);
      if (bad.some(function(t){ return body.includes(t);  })) return 'body:'  + body.slice(0,40);
      return null;
    })()
  `).catch(() => null);

  if (httpSkip) {
    console.log(`   ⏭️ HTTP error — skipping (${httpSkip.slice(0,50)})`);
    record.status      = 'Skipped';
    record.details     = `HTTP error: ${httpSkip.slice(0, 80)}`;
    record.load_status = 'HTTPError';
    return;
  }

  await waitReady(driver, 10000);
  await sleep(rand(1500, 2500));  // reduced from 2500-4000
  await clearOverlays(driver);

  // Strategy 1: standard navigator
  const onContact = await findContactPage(driver);
  record.contact_page_status = onContact ? 'Opened' : 'Not found';
  await clearOverlays(driver);

  let form = await findContactForm(driver);

  // If original failure was NOT about form detection, skip slow strategies
  const wasFormIssue = originalStatus.includes('no contact form') ||
                       originalStatus.includes('no form') ||
                       originalStatus.includes('not found');

  // Strategy 2: scroll + JS wait — only if form was the issue
  if (!form && wasFormIssue) {
    console.log('   🔄 S2: Scroll + JS wait...');
    await aggressiveScroll(driver);
    await waitForJsForm(driver, 6000);  // reduced from 10000
    await clearOverlays(driver);
    form = await findContactForm(driver);
  }

  // Strategy 3: shadow DOM — only if form was the issue
  if (!form && wasFormIssue) {
    console.log('   🔄 S3: Shadow DOM...');
    const sf = await findShadowForm(driver);
    if (sf) { console.log('      ✅ Shadow DOM form'); form = sf; }
  }

  // Strategy 4: overlay removal — only if form was the issue
  if (!form && wasFormIssue) {
    console.log('   🔄 S4: Overlay removal...');
    try {
      await driver.executeScript(`
        Array.from(document.querySelectorAll('*')).forEach(function(el){
          var s=window.getComputedStyle(el);
          if((s.position==='fixed'||s.position==='absolute')&&
             parseInt(s.zIndex||0)>100&&
             el.tagName!=='FORM'&&!el.querySelector('form'))
            el.style.display='none';
        });
        document.body.style.overflow='auto';
        document.documentElement.style.overflow='auto';
      `);
    } catch (_) {}
    await sleep(800);
    form = await findContactForm(driver);
  }

  if (!form) {
    record.status = 'Failed';
    record.details = 'No contact form found after all strategies';
    record.form_status = 'Not found';
    console.log('   ❌ No form found');
    return;
  }

  record.form_status = 'Found';
  console.log('   ✅ Form found — filling...');

  try { await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', form); }
  catch (_) {}
  await sleep(rand(1000, 1800));

  const multiStep = await isMultiStep(form, driver);
  let filled = [], failed = [];

  if (multiStep) {
    console.log('   📋 Multi-step form');
    const r = await handleMultiStep(driver, form, contact, record);
    filled = r.filled; failed = r.failed; form = r.form;
  } else {
    const usedFields = new Set();
    await fillAllFields(driver, form, contact, usedFields, filled, failed);
    if (!['full_name','first_name','email'].some(f => filled.includes(f))) {
      console.log('   🔄 Critical fields missing — retry fill...');
      try { await driver.executeScript('window.scrollTo(0,document.body.scrollHeight*0.4)'); } catch (_) {}
      await sleep(rand(800, 1400));
      const rf = [], rfa = [];
      await fillAllFields(driver, form, contact, usedFields, rf, rfa);
      if (rf.length) { filled.push(...rf); }
    }
    record.fields_filled = String(filled.length);
    record.filled_fields = filled.join(',');
    record.failed_fields = failed.join(',');
  }

  console.log(`   ✅ Filled ${filled.length}: [${filled.join(', ')}]`);
  if (failed.length) console.log(`   ℹ️  Not filled: [${failed.join(', ')}]`);

  if (!filled.length) {
    record.status = 'Failed'; record.details = 'Form found but no fields filled'; return;
  }

  await checkCheckboxes(driver, form);
  await sleep(rand(1200, 2000));

  const captchaResult = await handleCaptcha(driver, record, 'pre-submit', form, CAPTCHA_WAIT_TIMEOUT);
  if (captchaResult === 'blocked' || captchaResult === 'retry') return;
  if (!record.captcha_status) record.captcha_status = 'Not present';
  const preCapSolved = captchaResult === 'clear' && (record.captcha_status || '').includes('pre-submit');

  await sleep(rand(1000, 2000));
  const [submitted, lastError] = await submitForm(driver, form, record);
  await sleep(rand(2000, 3000));

  if (!preCapSolved) {
    const postCaptcha = await handleCaptcha(driver, record, 'post-submit', form, CAPTCHA_WAIT_TIMEOUT);
    if (postCaptcha === 'retry') { record.captcha_status = record.captcha_status || 'Not solved at post-submit'; return; }
    if (postCaptcha === 'blocked') {
      // Check if it's V3 — mark as skipped not failed
      if ((record.captcha_status || '').includes('V3')) {
        record.status  = 'Skipped';
        record.details = 'reCAPTCHA V3 blocked — score-based, not solvable';
      }
      return;
    }
    // Page already showed success
    if (postCaptcha === 'clear' && (record.captcha_status || '').includes('already')) {
      const emailOk = filled.includes('email');
      const nameOk  = filled.includes('full_name') || filled.includes('first_name');
      record.status  = (emailOk && nameOk) ? 'Success' : 'Partial';
      record.details = 'Page showed success after submit';
      record.success_status = 'Success detected';
      console.log(`   ✅ ${record.status}: ${record.details}`);
      return;
    }
    if (postCaptcha === 'clear' && (record.captcha_status || '').includes('post-submit')) {
      console.log('   🔄 Post-submit captcha solved — resubmitting...');
      await sleep(rand(1000, 2000));
      await submitForm(driver, form, record);
      await sleep(rand(2000, 3000));
    }
  }

  await sleep(rand(1000, 2000));

  if (submitted) {
    if (await detectSuccess(driver)) {
      const emailOk = filled.includes('email');
      const nameOk  = filled.includes('full_name') || filled.includes('first_name');
      record.status  = (emailOk && nameOk) ? 'Success' : 'Partial';
      record.details = (emailOk && nameOk)
        ? 'Verified thank-you / redirect'
        : `Submitted but missing: ${!emailOk?'email ':''} ${!nameOk?'name':''}`.trim();
      record.success_status = 'Success detected';
      console.log(`   ${record.status === 'Success' ? '✅' : '⚠️'} ${record.details}`);
    } else {
      record.details = 'Submitted but no confirmation detected';
      record.success_status = 'No confirmation';
      takeDebugScreenshot(driver, 'retry_no_confirm');
    }
  } else {
    if (await detectSuccess(driver)) {
      record.status = 'Success'; record.details = 'Success detected (submit not tracked)';
      record.success_status = 'Success detected';
    } else {
      record.details = `Submit failed: ${lastError || 'No button found'}`;
      record.success_status = 'No success detected';
      takeDebugScreenshot(driver, 'retry_no_submit');
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(path.join(__dirname, OUTPUT_DIR), { recursive: true });

  // Load all URLs that need retry
  const allFailed = loadFailedUrls();
  if (!allFailed.length) { console.log('✅ No failed URLs in CSV — nothing to retry.'); return; }

  // Load already-done URLs (Success/Partial in retry_results.csv)
  const doneUrls = loadDoneUrls();

  // Filter out already-done
  const queue = allFailed.filter(e => !doneUrls.has(e.url));

  console.log(`\n🔁 Retry Mode`);
  console.log(`   Total failed  : ${allFailed.length}`);
  console.log(`   Already done  : ${doneUrls.size}`);
  console.log(`   To process    : ${queue.length}\n`);

  if (!queue.length) { console.log('✅ All failed URLs already retried successfully.'); return; }

  // Resume: load saved progress index
  const startIdx = loadProgress();
  if (startIdx > 0) console.log(`▶️  Resuming from #${startIdx + 1} / ${queue.length}\n`);

  const stillFailing = [];

  for (let i = startIdx; i < queue.length; i++) {
    const { url, status, details } = queue[i];
    console.log(`\n🟡 [${i + 1}/${queue.length}] ${url}`);

    for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES + 1; attempt++) {
      const record  = Object.fromEntries(CSV_FIELDS.map(f => [f, '']));
      record.url    = url;
      record.status = 'Failed';

      const contact = getNextContact();
      console.log(`   👤 ${contact.full_name} <${contact.email}>`);

      const driver = await makeDriver();
      try {
        await retryUrl(driver, url, record, contact, `${status}: ${details}`);
      } catch (e) {
        const msg = e.message || '';
        const isNet = ['ERR_NAME_NOT_RESOLVED','ERR_CONNECTION_REFUSED',
          'ERR_CONNECTION_TIMED_OUT','ERR_INTERNET_DISCONNECTED','net::ERR_'].some(x => msg.includes(x));
        if (isNet) {
          record.status = 'Skipped'; record.details = `Network: ${msg.slice(0,120)}`;
          record.load_status = 'NetworkError';
          console.log('   ⏭️ Network error — skipping');
        } else {
          record.details = `${e.constructor.name}: ${msg.slice(0,120)}`;
          console.log(`   ❌ ${e.constructor.name}: ${msg.slice(0,120)}`);
          takeDebugScreenshot(driver, 'retry_error');
        }
      } finally {
        try { await driver.quit(); } catch (_) {}
      }

      // CAPTCHA retry with fresh browser
      const captchaFailed = (record.captcha_status || '').toLowerCase().includes('not solved') ||
                            (record.captcha_status || '').toLowerCase().includes('retry');
      if (captchaFailed && attempt <= MAX_CAPTCHA_RETRIES) {
        console.log(`   🔄 CAPTCHA retry ${attempt}/${MAX_CAPTCHA_RETRIES}...`);
        await sleep(rand(2000, 4000));
        continue;
      }

      // ── Record result ─────────────────────────────────────────────────────
      appendRecord(record);
      try { sendToRetrySheet(record); } catch (_) {}

      const ok = record.status === 'Success' || record.status === 'Partial';
      if (ok) {
        console.log(`   ✅ ${record.status}: ${record.details}`);
      } else {
        console.log(`   ❌ Still failed: ${record.details}`);
        stillFailing.push(url);
      }

      await sleep(rand(3000, 6000));
      break;
    }

    // Save progress after each URL (Ctrl+C safe)
    saveProgress(i + 1);
  }

  // Save still-failing URLs
  if (stillFailing.length) {
    fs.writeFileSync(RETRY_SKIP, stillFailing.join('\n') + '\n', 'utf8');
    console.log(`\n📝 ${stillFailing.length} still failing → ${RETRY_SKIP}`);
  }

  // Read final counts from retry_results.csv
  let success = 0, partial = 0, failed = 0, skipped = 0;
  try {
    const lines = fs.readFileSync(RETRY_CSV, 'utf8').split('\n').filter(Boolean).slice(1);
    const hdrs  = parseCsvLine(fs.readFileSync(RETRY_CSV,'utf8').split('\n')[0]).map(h=>h.toLowerCase());
    const si    = hdrs.indexOf('status');
    for (const l of lines) {
      const st = (parseCsvLine(l)[si] || '').toLowerCase();
      if (st === 'success') success++;
      else if (st === 'partial') partial++;
      else if (st === 'skipped') skipped++;
      else failed++;
    }
  } catch (_) {}

  clearProgress();

  console.log(`\n🏁 Retry Complete!`);
  console.log(`   ✅ Success  : ${success}`);
  console.log(`   ⚠️  Partial  : ${partial}`);
  console.log(`   ❌ Failed   : ${failed}`);
  console.log(`   ⏭️  Skipped  : ${skipped}`);
  console.log(`   📄 Results  → ${RETRY_CSV}`);
})();
