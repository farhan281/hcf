// captcha/handler.js
'use strict';

const { detectCaptchaState, captchaSolved } = require('./detector');
const { solveRecaptchaAudio }               = require('./recaptcha');
const { waitForTurnstileAutoClear }         = require('./turnstile');
const { solveImageCaptcha }                 = require('./image_captcha');
const { solveHcaptcha }                     = require('./hcaptcha');
const { CAPTCHA_POLICY, CAPTCHA_WAIT_TIMEOUT } = require('../config');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function handleCaptcha(driver, record, stage, formContext, timeout) {
  timeout = timeout || CAPTCHA_WAIT_TIMEOUT;

  // ── Post-submit: check success BEFORE detecting captcha ──────────────────────
  // Some sites (nogood.io) show thank-you AND captcha simultaneously.
  // If page already shows success, skip captcha entirely.
  if (stage === 'post-submit') {
    try {
      await driver.switchTo().defaultContent();
      const alreadySuccess = await driver.executeScript(function() {
        var body = (document.body ? document.body.innerText : '').toLowerCase();
        var url  = window.location.href.toLowerCase();
        var TEXTS = ['thank you','thanks for','message sent','message received',
          'successfully submitted','form submitted','we will get back',
          'we have received','received your','inquiry received','enquiry received',
          'request received','submission received'];
        var SELS = ['.wpcf7-mail-sent-ok','.elementor-message-success',
          '.gform_confirmation_message','.wpforms-confirmation',
          '.alert-success','.success-message','.form-success',
          '[class*="confirmation"]','[class*="thank-you"]','[class*="thankyou"]'];
        if (TEXTS.some(function(t){ return body.indexOf(t) !== -1; })) return true;
        for (var i=0; i<SELS.length; i++) {
          var els = document.querySelectorAll(SELS[i]);
          for (var j=0; j<els.length; j++) {
            if (els[j].offsetParent !== null && (els[j].innerText||'').trim().length > 2)
              return true;
          }
        }
        if (['thank','success','confirm','sent','received','submitted']
            .some(function(w){ return url.indexOf(w) !== -1; })) return true;
        return false;
      }).catch(() => false);
      if (alreadySuccess) {
        console.log('   ✅ Page already shows success — skipping post-submit captcha check');
        record.captcha_status = 'already-success';  // signal to caller
        return 'clear';
      }
    } catch (_) {}
  }

  const state = await detectCaptchaState(driver, formContext);
  if (!state.present) return 'clear';

  const reason = state.reason || 'CAPTCHA challenge';

  // reCAPTCHA V3 — invisible, score-based, cannot be solved by automation
  // Skip these sites to avoid wasting time
  if (reason.toLowerCase().includes('v3') || reason.toLowerCase().includes('recaptcha v3')) {
    console.log(`   ⏭️ reCAPTCHA V3 detected — skipping (cannot solve score-based captcha)`);
    record.status         = 'Skipped';
    record.details        = 'reCAPTCHA V3 — score-based, not solvable';
    record.captcha_status = `reCAPTCHA V3 at ${stage}`;
    return 'blocked';
  }

  const isImageCaptcha = reason.toLowerCase().includes('image');

  // Image CAPTCHA (securimage, text-in-image) — always try OCR regardless of policy
  if (isImageCaptcha) {
    console.log(`   🖼️ Image/Math CAPTCHA detected — trying solver...`);
    if (await solveImageCaptcha(driver, formContext)) {
      record.captcha_status = `Auto-solved at ${stage}: ${reason}`;
      return 'clear';
    }
    // Math captcha failed — don't block, just continue (form may still submit)
    console.log(`   ⚠️ Math/Image solver failed — continuing anyway`);
    record.captcha_status = `Math solver attempted at ${stage}`;
    return 'clear';
  }

  if (CAPTCHA_POLICY === 'block') {
    console.log(`   🛑 CAPTCHA blocked at ${stage}: ${reason}`);
    record.status         = 'CaptchaBlocked';
    record.details        = `Blocked by ${reason} at ${stage}`;
    record.captcha_status = `Blocked at ${stage}: ${reason}`;
    return 'blocked';
  }

  if (CAPTCHA_POLICY === 'auto') {
    console.log(`   🤖 Auto-solving CAPTCHA at ${stage}: ${reason}`);
    const isCF        = ['turnstile','cloudflare','cf '].some(w => reason.toLowerCase().includes(w));
    const isRecaptcha = reason.toLowerCase().includes('recaptcha');

    if (isCF) {
      // First check if Turnstile is already solved (token present)
      const alreadySolved = await driver.executeScript(function() {
        var inp = document.querySelector('input[name="cf-turnstile-response"]');
        return inp && (inp.value || '').length > 10;
      }).catch(() => false);
      if (alreadySolved) {
        console.log('      ✅ Turnstile already solved (token present)');
        record.captcha_status = `Auto-cleared at ${stage}: ${reason}`;
        return 'clear';
      }
      if (await waitForTurnstileAutoClear(driver, formContext)) {
        record.captcha_status = `Auto-cleared at ${stage}: ${reason}`;
        return 'clear';
      }
      console.log(`   ⚠️ Turnstile not solved — retrying with fresh browser`);
      record.details        = `${reason} not solved at ${stage}`;
      record.captcha_status = `Not solved at ${stage}: ${reason}`;
      return 'retry';
    }

    if (isRecaptcha) {
      if (await solveRecaptchaAudio(driver)) {
        record.captcha_status = `Auto-solved at ${stage}: ${reason}`;
        return 'clear';
      }
      // Post-submit reCAPTCHA — retry with fresh browser instead of hard skip
      if (stage === 'post-submit') {
        console.log(`   ⚠️ reCAPTCHA not solved at post-submit — retrying with fresh browser`);
        record.details        = `reCAPTCHA not solved at ${stage}`;
        record.captcha_status = `Not solved at ${stage}: ${reason}`;
        return 'retry';
      }
      console.log(`   ⚠️ reCAPTCHA not solved at ${stage} (likely rate-limited), skipping`);
      record.status         = 'Skipped';
      record.details        = `${reason} rate-limited at ${stage}`;
      record.captcha_status = `Rate-limited at ${stage}: ${reason}`;
      return 'blocked';
    }

    const isHcaptcha = reason.toLowerCase().includes('hcaptcha');
    if (isHcaptcha) {
      console.log(`   🤖 hCaptcha detected at ${stage} — using CNN solver...`);
      if (await solveHcaptcha(driver)) {
        record.captcha_status = `Auto-solved at ${stage}: ${reason}`;
        return 'clear';
      }
      console.log(`   ⚠️ hCaptcha CNN solver failed at ${stage}`);
      record.details        = `hCaptcha not solved at ${stage}`;
      record.captcha_status = `Not solved at ${stage}: ${reason}`;
      return 'retry';
    }

    // Image CAPTCHA — try for any non-CF/non-reCAPTCHA/non-hCaptcha reason
    console.log(`   🖼️ Trying image CAPTCHA solver...`);
    if (await solveImageCaptcha(driver, formContext)) {
      record.captcha_status = `Auto-solved at ${stage}: ${reason}`;
      return 'clear';
    }

    console.log(`   ⚠️ Auto-solve failed at ${stage}, falling back to manual wait`);
  }

  // Manual wait
  console.log(`   🔐 CAPTCHA at ${stage}: ${reason}. Waiting up to ${timeout/1000}s...`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await captchaSolved(driver)) {
      console.log('      ✅ CAPTCHA solved');
      record.captcha_status = `Solved manually at ${stage}: ${reason}`;
      return 'clear';
    }
    await sleep(2000);
  }

  console.log('   ⏭️ CAPTCHA not solved in time, skipping');
  record.details        = `${reason} not solved within ${timeout/1000}s at ${stage}`;
  record.captcha_status = `Not solved within ${timeout/1000}s at ${stage}: ${reason}`;
  return 'retry';
}

module.exports = { handleCaptcha };
