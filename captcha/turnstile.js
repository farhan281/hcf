// captcha/turnstile.js
'use strict';

const { By } = require('selenium-webdriver');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sw(driver) {
  try { await driver.switchTo().defaultContent(); } catch (_) {}
}

async function injectTurnstileToken(driver, token) {
  await driver.executeScript(`
    document.querySelectorAll('input[name="cf-turnstile-response"]').forEach(function(el) {
      el.value = arguments[0];
      el.dispatchEvent(new Event('change', {bubbles:true}));
    });
  `, token);
}

async function tryClickTurnstileCheckbox(driver) {
  try {
    await sw(driver);
    const iframes = await driver.findElements(By.css(
      "iframe[src*='turnstile'],iframe[src*='challenges.cloudflare']"));
    for (const iframe of iframes) {
      if (!(await iframe.isDisplayed())) continue;
      try {
        await driver.switchTo().frame(iframe);
        for (const sel of ["input[type='checkbox']","[id*='checkbox']","[class*='checkbox']","label","body"]) {
          const els = await driver.findElements(By.css(sel));
          if (els.length) {
            await driver.executeScript('arguments[0].click();', els[0]);
            console.log('      🖱️ Clicked Turnstile checkbox');
            await sw(driver);
            return true;
          }
        }
        await sw(driver);
      } catch (_) { await sw(driver); }
    }
  } catch (_) { await sw(driver); }
  return false;
}

async function waitForTurnstileAutoClear(driver, formContext, attempts = 15, delay = 3000) {
  const { detectCaptchaState } = require('./detector');
  await tryClickTurnstileCheckbox(driver);
  for (let i = 0; i < attempts; i++) {
    await sleep(delay);
    const state = await detectCaptchaState(driver, formContext);
    if (!state.present) { console.log('      ✅ Cloudflare Turnstile auto-cleared'); return true; }
    if (i > 0 && i % 5 === 0) await tryClickTurnstileCheckbox(driver);
  }
  return false;
}

module.exports = { injectTurnstileToken, tryClickTurnstileCheckbox, waitForTurnstileAutoClear };
