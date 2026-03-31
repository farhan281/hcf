// captcha/detector.js
'use strict';

const { By } = require('selenium-webdriver');

async function selPresent(ctx, selector, visible = false) {
  try {
    const els = await ctx.findElements(By.css(selector));
    if (!els.length) return false;
    if (!visible) return true;
    for (const e of els) { if (await e.isDisplayed()) return true; }
    return false;
  } catch (_) { return false; }
}

async function isRecaptchaV2Visible(driver) {
  try {
    // Check if bframe (challenge popup) is present — means reCAPTCHA is active
    const bframes = await driver.findElements(By.css("iframe[src*='recaptcha'][src*='bframe']"));
    for (const f of bframes) {
      if (await f.isDisplayed()) return true;
    }
    // Check challenge iframes
    const challenges = await driver.findElements(By.css("iframe[title*='recaptcha challenge']"));
    for (const f of challenges) {
      if (await f.isDisplayed()) return true;
    }
    // Check anchor iframe (unchecked checkbox)
    const frames = await driver.findElements(By.css("iframe[src*='recaptcha'][src*='anchor']"));
    for (const iframe of frames) {
      if (!(await iframe.isDisplayed())) continue;
      const rect = await iframe.getRect();
      if (rect.width < 60 || rect.height < 30) continue;
      try {
        await driver.switchTo().frame(iframe);
        const unchecked = await driver.findElements(By.css('#recaptcha-anchor,.recaptcha-checkbox-border'));
        await driver.switchTo().defaultContent();
        if (unchecked.length) return true;
      } catch (_) { try { await driver.switchTo().defaultContent(); } catch (_2) {} }
    }
    const widgets = await driver.findElements(By.css('.g-recaptcha'));
    for (const w of widgets) {
      if (!(await w.isDisplayed())) continue;
      const rect = await w.getRect();
      if (rect.width > 60 && rect.height > 30) return true;
    }
  } catch (_) { try { await driver.switchTo().defaultContent(); } catch (_2) {} }
  return false;
}

async function detectCaptchaState(driver, formContext) {
  const ctx = formContext || driver;

  if (await isRecaptchaV2Visible(driver)) return { present: true, reason: 'reCAPTCHA v2' };

  const hcaptchaChecks = [
    ['hCaptcha iframe',   "iframe[title*='hCaptcha']",             true],
    ['hCaptcha iframe',   "iframe[src*='hcaptcha']",               true],
    ['hCaptcha widget',   '.h-captcha',                            true],
    ['hCaptcha response', "textarea[name='h-captcha-response']",   false],
  ];
  for (const [reason, sel, vis] of hcaptchaChecks) {
    if (await selPresent(ctx, sel, vis)) {
      try {
        const resp = await ctx.findElements(By.css("textarea[name='h-captcha-response']"));
        if (resp.length && (await resp[0].getAttribute('value') || '').trim()) break;
      } catch (_) {}
      return { present: true, reason };
    }
  }

  const cfChecks = [
    ['Turnstile widget',           '.cf-turnstile',                              true],
    ['Turnstile iframe',           "iframe[src*='turnstile']",                   true],
    ['Cloudflare iframe',          "iframe[src*='challenges.cloudflare.com']",   true],
    ['CF challenge form',          '#challenge-form',                            false],
    ['CF challenge stage',         '#challenge-stage',                           false],
    ['CF challenge running',       '#challenge-running',                         false],
    ['CF widget id',               '[id*="cf-chl-widget"]',                      true],
    ['CF widget class',            '[class*="cf-chl"]',                          true],
  ];
  for (const [reason, sel, vis] of cfChecks) {
    if (await selPresent(ctx, sel, vis)) return { present: true, reason };
  }

  try {
    const url = (await driver.getCurrentUrl() || '').toLowerCase();
    if (['/cdn-cgi/challenge-platform/','/cdn-cgi/l/chk_jschl'].some(m => url.includes(m)))
      return { present: true, reason: 'Cloudflare challenge URL' };
  } catch (_) {}

  try {
    const body  = (await driver.executeScript("return document.body ? document.body.innerText.toLowerCase() : '';") || '');
    const title = (await driver.getTitle() || '').toLowerCase();
    const cfPhrases = ['just a moment','checking your browser before accessing',
      'attention required','please enable cookies','verify you are human',
      'security check to access','checking if the site connection is secure'];
    if (cfPhrases.some(p => body.includes(p) || title.includes(p))) {
      const html = (await driver.getPageSource() || '').toLowerCase();
      if (['cloudflare'].some(w => body.includes(w) || title.includes(w) || html.includes(w)))
        return { present: true, reason: 'Cloudflare interstitial' };
    }
    if (["i am human","i'm human","not a robot","robot check"].some(p => body.includes(p)))
      return { present: true, reason: 'Captcha challenge text' };
  } catch (_) {}

  // Math CAPTCHA — scan ALL visible inputs for math question labels
  try {
    const mathFound = await driver.executeScript(function() {
      function getLabel(el) {
        if (el.id) { var l=document.querySelector('label[for="'+el.id+'"]'); if(l) return l.innerText; }
        var a=el.getAttribute('aria-label'); if(a) return a;
        var prev=el.previousElementSibling; if(prev&&prev.innerText) return prev.innerText;
        var par=el.parentElement; if(par&&par.innerText) return par.innerText;
        return el.placeholder||'';
      }
      var inputs = Array.from(document.querySelectorAll('input[type=text],input[type=number],input:not([type])'));
      for (var i=0; i<inputs.length; i++) {
        var el=inputs[i];
        if (el.offsetParent===null) continue;
        var q=getLabel(el).toLowerCase();
        var name=(el.name||'').toLowerCase();
        var id=(el.id||'').toLowerCase();
        // Check label for math question
        if (/\d+\s*[+\-*\/x×÷]\s*\d+/.test(q) ||
            /(plus|minus|times|divided|multiplied|add|subtract)/.test(q) ||
            /what is|calculate|solve|correct answer|enter.*answer|spam.*protect|anti.?spam/.test(q) ||
            /captcha|verify|human|robot|math|spam|answer/.test(name+' '+id)) {
          return true;
        }
      }
      return false;
    });
    if (mathFound) return { present: true, reason: 'Image CAPTCHA' };
  } catch (_) {}

  // Image CAPTCHA
  try {
    const found = await driver.executeScript(`
      var IMG_SELS = ['img[src*="captcha" i]','img[id*="captcha" i]','img[class*="captcha" i]',
                      'img[src*="securimage" i]','img[src*="verify" i]','img[src*="security" i]'];
      var INP_SELS = ['input[name*="captcha" i]','input[id*="captcha" i]',
                      'input[name*="securimage" i]','input[name*="security_code" i]',
                      'input[name*="verify" i]'];
      function isCaptchaImg(el) {
        var combined = (el.src||'')+' '+(el.alt||'')+' '+(el.className||'')+' '+(el.id||'');
        combined = combined.toLowerCase();
        if (!['captcha','securimage','verify','security_code'].some(function(s){ return combined.indexOf(s)!==-1; })) return false;
        if (['logo','icon','banner','avatar','social'].some(function(r){ return combined.indexOf(r)!==-1; })) return false;
        var w=el.offsetWidth,h=el.offsetHeight;
        return w>=30 && h>=15 && h<=150 && w<=600;
      }
      var hasImg = IMG_SELS.some(function(s){
        return Array.from(document.querySelectorAll(s)).some(function(e){ return e.offsetParent!==null && isCaptchaImg(e); });
      });
      var hasInp = INP_SELS.some(function(s){
        return Array.from(document.querySelectorAll(s)).some(function(e){ return e.offsetParent!==null; });
      });
      return hasImg && hasInp;
    `);
    if (found) return { present: true, reason: 'Image CAPTCHA' };
  } catch (_) {}

  return { present: false, reason: '' };
}

async function captchaSolved(driver) {
  try {
    await driver.switchTo().defaultContent();
    const frames = await driver.findElements(By.css("iframe[src*='recaptcha'][src*='anchor']"));
    for (const iframe of frames) {
      if ((await iframe.getRect()).width < 60) continue;
      try {
        await driver.switchTo().frame(iframe);
        const checked = await driver.findElements(By.css(".recaptcha-checkbox-checked,[aria-checked='true']"));
        await driver.switchTo().defaultContent();
        if (checked.length) return true;
      } catch (_) { try { await driver.switchTo().defaultContent(); } catch (_2) {} }
    }
  } catch (_) { try { await driver.switchTo().defaultContent(); } catch (_2) {} }
  try {
    const tokens = await driver.findElements(By.css(
      "textarea[name='g-recaptcha-response'],textarea[name='h-captcha-response'],input[name='cf-turnstile-response']"));
    for (const t of tokens) {
      if ((await t.getAttribute('value') || '').trim()) return true;
    }
  } catch (_) {}
  return false;
}

module.exports = { detectCaptchaState, captchaSolved, isRecaptchaV2Visible };
