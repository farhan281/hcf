// captcha/image_captcha.js
'use strict';

const fs               = require('fs');
const path             = require('path');
const os               = require('os');
const { execFileSync } = require('child_process');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Tesseract.js worker ───────────────────────────────────────────────────────
let _worker = null;
async function getWorker() {
  if (_worker) return _worker;
  const { createWorker } = require('tesseract.js');
  console.log('      🔄 Loading Tesseract.js...');
  _worker = await createWorker('eng', 1, { logger: () => {} });
  return _worker;
}

// ── Word numbers map ──────────────────────────────────────────────────────────
const WORD_NUMS = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
  sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
  thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,
};

function solveMathExpr(text) {
  let t = (text || '').toLowerCase().trim();
  // Replace word numbers
  for (const [word, num] of Object.entries(WORD_NUMS)) {
    t = t.replace(new RegExp('\\b' + word + '\\b', 'g'), String(num));
  }
  // Replace word operators
  t = t.replace(/\bplus\b/g, '+')
       .replace(/\bminus\b/g, '-')
       .replace(/\btimes\b|\bmultiplied\s*by\b/g, '*')
       .replace(/\bdivided\s*by\b/g, '/')
       .replace(/[×]/g, '*').replace(/[÷]/g, '/');
  // Extract math expression — handles negative numbers too
  const m = t.match(/(-?\d+)\s*([+\-*/])\s*(-?\d+)/);
  if (!m) return null;
  const a = parseInt(m[1]), op = m[2], b = parseInt(m[3]);
  if (isNaN(a) || isNaN(b)) return null;
  switch (op) {
    case '+': return String(a + b);
    case '-': return String(a - b);
    case '*': return String(a * b);
    case '/': return b !== 0 ? String(Math.round(a / b)) : null;
  }
  return null;
}

function hasMathExpr(text) {
  const t = (text || '').toLowerCase();
  return /\d+\s*[+\-*\/x×÷]\s*\d+/.test(t) ||
         /\b(plus|minus|times|divided|multiplied)\b/.test(t);
}

// ── Math CAPTCHA — scan ALL possible DOM structures ───────────────────────────
async function solveMathCaptcha(driver) {
  const found = await driver.executeScript(function() {
    function hasMath(t) {
      t = (t || '').toLowerCase();
      return /\d+\s*[+\-*\/x×÷]\s*\d+/.test(t) ||
             /\b(plus|minus|times|divided|multiplied)\b/.test(t);
    }

    function getText(el) {
      return (el && (el.innerText || el.textContent) || '').trim();
    }

    function getLabel(el) {
      // 1. label[for=id]
      if (el.id) {
        var l = document.querySelector('label[for="' + el.id + '"]');
        if (l) return getText(l);
      }
      // 2. aria-label
      var a = el.getAttribute('aria-label');
      if (a) return a.trim();
      // 3. placeholder
      if (el.placeholder) return el.placeholder;
      // 4. previous sibling text
      var prev = el.previousElementSibling;
      if (prev && getText(prev)) return getText(prev);
      // 5. parent element text
      var par = el.parentElement;
      if (par) return getText(par);
      return '';
    }

    function getContext(el) {
      // Collect text from: label, placeholder, parent, grandparent, nearby spans/divs
      var texts = [];
      texts.push(getLabel(el));
      var par = el.parentElement;
      if (par) {
        texts.push(getText(par));
        var gpar = par.parentElement;
        if (gpar) texts.push(getText(gpar));
        // Nearby spans/p/div siblings
        Array.from(par.children).forEach(function(c) {
          if (c !== el) texts.push(getText(c));
        });
      }
      // Check for a nearby element with math question pattern
      var nearby = document.querySelectorAll('span,p,div,label,strong,em,td,th');
      for (var i = 0; i < nearby.length; i++) {
        var rect1 = el.getBoundingClientRect();
        var rect2 = nearby[i].getBoundingClientRect();
        var dist = Math.abs(rect1.top - rect2.top) + Math.abs(rect1.left - rect2.left);
        if (dist < 200 && hasMath(getText(nearby[i]))) {
          texts.push(getText(nearby[i]));
        }
      }
      return texts.join(' ');
    }

    var inputs = Array.from(document.querySelectorAll(
      'input[type=text],input[type=number],input:not([type])'
    )).filter(function(e) { return e.offsetParent !== null; });

    // Pass 1: direct label/placeholder has math
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var lbl = getLabel(el);
      if (hasMath(lbl)) return { inp: el, question: lbl };
    }

    // Pass 2: name/id suggests captcha/math AND context has math
    for (var j = 0; j < inputs.length; j++) {
      var em = inputs[j];
      var nm = (em.name || '').toLowerCase();
      var id = (em.id || '').toLowerCase();
      if (/math|captcha|human|spam|answer|verify|antispam|anti_spam|bot|check|result|sum|calc/.test(nm + ' ' + id)) {
        var ctx = getContext(em);
        if (hasMath(ctx) || ctx.length > 0) {
          return { inp: em, question: ctx || nm + ' ' + id };
        }
      }
    }

    // Pass 3: any input whose full context has math expression
    for (var k = 0; k < inputs.length; k++) {
      var ek = inputs[k];
      var ctx2 = getContext(ek);
      if (hasMath(ctx2)) return { inp: ek, question: ctx2 };
    }

    return null;
  }).catch(() => null);

  if (!found || !found.question) return false;

  const question = found.question.replace(/\s+/g, ' ').trim();
  console.log(`      🔢 Math CAPTCHA: "${question.slice(0, 80)}"`);

  const answer = solveMathExpr(question);
  if (answer === null) {
    console.log(`      ⚠️ Cannot parse math: "${question.slice(0, 80)}"`);
    return false;
  }

  console.log(`      ✅ Math answer: ${answer}`);
  await typeAnswer(driver, found.inp, answer);
  return true;
}

// ── Image CAPTCHA — find image + input pair ───────────────────────────────────
const IMG_SELS = [
  "img[src*='captcha' i]", "img[id*='captcha' i]", "img[class*='captcha' i]",
  "img[alt*='captcha' i]", "img[src*='securimage' i]", "img[src*='verify' i]",
  "img[src*='security' i]", "img[src*='code' i]", "img[src*='chk' i]",
  "img[src*='random' i]", "img[src*='image.php' i]", "img[src*='captcha.php' i]",
  "img[src*='num' i]", "img[src*='check' i]", "img[src*='challenge' i]",
];
const INP_SELS = [
  "input[name*='captcha' i]", "input[id*='captcha' i]",
  "input[placeholder*='captcha' i]", "input[name*='securimage' i]",
  "input[name*='security_code' i]", "input[id*='security_code' i]",
  "input[name*='verify' i]", "input[id*='verify' i]",
  "input[name*='code' i]", "input[placeholder*='code' i]",
  "input[placeholder*='enter' i]", "input[placeholder*='type' i]",
  "input[name*='antispam' i]", "input[name*='anti_spam' i]",
  "input[name*='human' i]", "input[id*='human' i]",
  "input[name*='check' i]", "input[id*='check' i]",
];

async function findImageCaptcha(driver) {
  return await driver.executeScript(function() {
    var IMG_SELS = arguments[0], INP_SELS = arguments[1];

    function isCaptchaImg(el) {
      var combined = ((el.src||'') + ' ' + (el.alt||'') + ' ' + (el.className||'') + ' ' + (el.id||'')).toLowerCase();
      if (!['captcha','securimage','verify','security_code','chk','random','challenge'].some(function(s){ return combined.indexOf(s) !== -1; })) return false;
      if (['logo','icon','banner','avatar','social','facebook','twitter','instagram','arrow','menu','star','badge'].some(function(r){ return combined.indexOf(r) !== -1; })) return false;
      var w = el.offsetWidth || el.naturalWidth;
      var h = el.offsetHeight || el.naturalHeight;
      return w >= 20 && h >= 10 && h <= 250 && w <= 800;
    }

    var imgEl = null, inpEl = null;
    for (var i = 0; i < IMG_SELS.length && !imgEl; i++) {
      var els = document.querySelectorAll(IMG_SELS[i]);
      for (var j = 0; j < els.length; j++) {
        if (els[j].offsetParent !== null && isCaptchaImg(els[j])) { imgEl = els[j]; break; }
      }
    }
    for (var k = 0; k < INP_SELS.length && !inpEl; k++) {
      var inps = document.querySelectorAll(INP_SELS[k]);
      for (var l = 0; l < inps.length; l++) {
        if (inps[l].offsetParent !== null) { inpEl = inps[l]; break; }
      }
    }
    if (!imgEl || !inpEl) return null;
    return { img: imgEl, inp: inpEl, src: imgEl.src || imgEl.getAttribute('src') || '', w: imgEl.offsetWidth, h: imgEl.offsetHeight };
  }, IMG_SELS, INP_SELS).catch(() => null);
}

// ── Fetch + preprocess image via canvas ──────────────────────────────────────
async function fetchAndPreprocess(driver, imgSrc) {
  return await driver.executeAsyncScript(function() {
    var src = arguments[0], done = arguments[arguments.length - 1];
    function processImage(imgEl) {
      var W = (imgEl.naturalWidth  || imgEl.width  || 200) * 3;
      var H = (imgEl.naturalHeight || imgEl.height || 60)  * 3;
      function makeVariant(filter) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        ctx.filter = filter;
        ctx.drawImage(imgEl, 0, 0, W, H);
        return c.toDataURL('image/png').split(',')[1];
      }
      done([
        makeVariant('contrast(300%) brightness(120%) grayscale(100%)'),
        makeVariant('contrast(300%) invert(100%) grayscale(100%)'),
        makeVariant('contrast(500%) grayscale(100%)'),
        makeVariant('none'),
      ]);
    }
    if (src.startsWith('data:')) {
      var img = new Image(); img.onload = function(){ processImage(img); }; img.src = src; return;
    }
    fetch(src, { credentials: 'include' })
      .then(function(r){ return r.blob(); })
      .then(function(blob){
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function(){ URL.revokeObjectURL(url); processImage(img); };
        img.onerror = function(){ done(null); };
        img.src = url;
      }).catch(function(){ done(null); });
  }, imgSrc).catch(() => null);
}

// ── OCR with Tesseract.js — multiple PSM modes + voting ──────────────────────
async function ocrVariants(variantBuffers) {
  const worker = await getWorker();
  const allResults = [];
  for (const buf of variantBuffers) {
    const tmpFile = path.join(os.tmpdir(), `cap_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    try {
      fs.writeFileSync(tmpFile, buf);
      for (const psm of ['7', '8', '6', '13']) {
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: psm,
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
          });
          const { data: { text, confidence } } = await worker.recognize(tmpFile);
          const clean = text.replace(/[^A-Za-z0-9]/g, '').trim();
          if (clean && clean.length >= 3 && clean.length <= 10) {
            allResults.push({ text: clean, confidence: confidence || 0 });
          }
        } catch (_) {}
      }
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }
  if (!allResults.length) return '';
  const freq = {}, conf = {};
  for (const r of allResults) {
    freq[r.text] = (freq[r.text] || 0) + 1;
    conf[r.text] = Math.max(conf[r.text] || 0, r.confidence);
  }
  const best = Object.keys(freq).sort((a, b) => freq[b] !== freq[a] ? freq[b] - freq[a] : conf[b] - conf[a])[0];
  console.log(`      🔤 OCR: "${best}" (${freq[best]}/${allResults.length} votes, conf=${conf[best].toFixed(0)})`);
  return best;
}

// ── Python fallback OCR ───────────────────────────────────────────────────────
function ocrWithPython(imagePath) {
  const PYTHON = process.env.PYTHON || '/usr/bin/python3';
  const script = `
import sys,re
try:
  from PIL import Image,ImageFilter
  import pytesseract
  img=Image.open(sys.argv[1]).convert('L')
  w,h=img.size
  img=img.resize((w*3,h*3),Image.LANCZOS)
  results=[]
  for thresh in [100,128,150]:
    for inv in [False,True]:
      v=img.point(lambda p:255 if p>thresh else 0)
      if inv: v=v.point(lambda p:255-p)
      v=v.filter(ImageFilter.SHARPEN)
      for psm in ['7','8','6']:
        t=pytesseract.image_to_string(v,config=f'--psm {psm} --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        t=re.sub(r'[^A-Za-z0-9]','',t).strip()
        if 3<=len(t)<=10:results.append(t)
  if results:
    from collections import Counter
    print(Counter(results).most_common(1)[0][0])
  else:print('')
except Exception as e:print('')
`.trim();
  try {
    const result = execFileSync(PYTHON, ['-c', script, imagePath], { timeout: 30000, encoding: 'utf8' }).trim();
    if (result) console.log(`      🐍 Python OCR: "${result}"`);
    return result;
  } catch (_) { return ''; }
}

// ── Type answer into captcha input ────────────────────────────────────────────
async function typeAnswer(driver, inpEl, text) {
  await driver.executeScript(function() {
    var el = arguments[0], val = arguments[1];
    el.scrollIntoView({ block: 'center' });
    el.focus();
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (setter && setter.set) setter.set.call(el, '');
    else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (setter && setter.set) setter.set.call(el, val);
    else el.value = val;
    ['input', 'change', 'blur'].forEach(function(t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }, inpEl, text);
  console.log(`      ✅ Typed CAPTCHA answer: "${text}"`);
}

// ── Reload captcha image ──────────────────────────────────────────────────────
async function reloadCaptcha(driver) {
  try {
    const done = await driver.executeScript(function() {
      var sels = ['[id*="reload" i]','[class*="reload" i]','[id*="refresh" i]',
                  '[class*="refresh" i]','a[href*="captcha" i]','[onclick*="captcha" i]'];
      for (var i = 0; i < sels.length; i++) {
        var el = document.querySelector(sels[i]);
        if (el && el.offsetParent !== null) { el.click(); return 'clicked'; }
      }
      var imgs = document.querySelectorAll('img[src*="captcha" i],img[src*="securimage" i],img[src*="verify" i]');
      if (imgs.length) {
        var src = imgs[0].getAttribute('src') || '';
        imgs[0].src = src + (src.indexOf('?') !== -1 ? '&' : '?') + '_t=' + Date.now();
        return 'reloaded';
      }
      return null;
    });
    if (done) { await sleep(1200); return true; }
  } catch (_) {}
  return false;
}

// ── Main solver ───────────────────────────────────────────────────────────────
async function solveImageCaptcha(driver) {
  // 1. Math CAPTCHA first (fastest, most reliable)
  const mathSolved = await solveMathCaptcha(driver);
  if (mathSolved) return true;

  // 2. Image OCR CAPTCHA
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`      🔄 Image CAPTCHA retry ${attempt}/3...`);
      await reloadCaptcha(driver);
    }

    const found = await findImageCaptcha(driver);
    if (!found) {
      if (attempt === 1) console.log('      ℹ️ No image CAPTCHA found');
      return false;
    }

    const { img: imgEl, inp: inpEl, src: imgSrc, w, h } = found;
    if (!imgSrc) { console.log('      ⚠️ Captcha image has no src'); return false; }
    console.log(`      🖼️ Image CAPTCHA: ${imgSrc.slice(0, 60)} (${w}×${h}px)`);

    const variants = await fetchAndPreprocess(driver, imgSrc);
    let text = '';

    if (variants && variants.length) {
      const buffers = variants.map(b64 => Buffer.from(b64, 'base64'));
      console.log(`      📡 OCR on ${buffers.length} variants...`);
      text = await ocrVariants(buffers);
      if (!text || text.length < 3) {
        console.log('      🐍 Tesseract uncertain — trying Python OCR...');
        const tmpFile = path.join(os.tmpdir(), `cap_py_${Date.now()}.png`);
        try {
          fs.writeFileSync(tmpFile, buffers[0]);
          text = ocrWithPython(tmpFile);
        } finally {
          try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
      }
    } else {
      // Canvas fetch failed — draw directly
      console.log('      📸 Canvas fetch failed — direct draw...');
      try {
        const png = await driver.executeScript(function() {
          var img = arguments[0];
          var c = document.createElement('canvas');
          c.width  = (img.naturalWidth  || img.offsetWidth  || 150) * 3;
          c.height = (img.naturalHeight || img.offsetHeight || 50)  * 3;
          var ctx = c.getContext('2d');
          ctx.filter = 'contrast(300%) grayscale(100%)';
          ctx.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/png').split(',')[1];
        }, imgEl);
        if (png) text = await ocrVariants([Buffer.from(png, 'base64')]);
      } catch (_) {}
    }

    if (!text) { console.log(`      ⚠️ OCR empty (attempt ${attempt}/3)`); continue; }

    try {
      await typeAnswer(driver, inpEl, text);
      return true;
    } catch (e) {
      console.log(`      ⚠️ Type failed: ${(e.message || '').slice(0, 80)}`);
      return false;
    }
  }

  console.log('      ⚠️ Image CAPTCHA failed after 3 attempts');
  return false;
}

process.on('exit', () => { if (_worker) _worker.terminate().catch(() => {}); });

module.exports = { solveImageCaptcha, solveMathCaptcha, solveMathExpr };
