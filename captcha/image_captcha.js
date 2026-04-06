// captcha/image_captcha.js
// Image CAPTCHA solver:
//   1. Find captcha image + answer input (NOT a form field)
//   2. Fetch image via JS canvas (credentials included)
//   3. Preprocess: multiple variants (contrast, invert, denoise)
//   4. OCR each variant with Tesseract.js (multiple PSM modes)
//   5. Vote on best result → type into input
'use strict';

const { By }           = require('selenium-webdriver');
const fs               = require('fs');
const path             = require('path');
const os               = require('os');
const { execFileSync } = require('child_process');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Tesseract.js worker (loaded once) ─────────────────────────────────────────
let _worker = null;
async function getWorker() {
  if (_worker) return _worker;
  const { createWorker } = require('tesseract.js');
  console.log('      🔄 Loading Tesseract.js...');
  _worker = await createWorker('eng', 1, { logger: () => {} });
  return _worker;
}

// ── Image CAPTCHA selectors ───────────────────────────────────────────────────
const IMG_SELS = [
  "img[src*='captcha' i]",    "img[id*='captcha' i]",
  "img[class*='captcha' i]",  "img[alt*='captcha' i]",
  "img[src*='securimage' i]", "img[src*='verify' i]",
  "img[src*='security' i]",   "img[src*='code' i]",
  "img[src*='chk' i]",        "img[src*='random' i]",
  "img[src*='image.php' i]",  "img[src*='captcha.php' i]",
  "img[src*='num' i]",        "img[src*='check' i]",
];
const INP_SELS = [
  "input[name*='captcha' i]",       "input[id*='captcha' i]",
  "input[placeholder*='captcha' i]","input[name*='securimage' i]",
  "input[name*='security_code' i]", "input[id*='security_code' i]",
  "input[name*='verify' i]",        "input[id*='verify' i]",
  "input[name*='code' i]",          "input[placeholder*='code' i]",
  "input[placeholder*='enter' i]",  "input[placeholder*='type' i]",
];

// ── Find captcha image + input in ONE JS call ─────────────────────────────────
async function findCaptcha(driver) {
  return await driver.executeScript(`
    var IMG_SELS = arguments[0], INP_SELS = arguments[1];

    function isCaptchaImg(el) {
      var src = (el.getAttribute('src')||'').toLowerCase();
      var alt = (el.getAttribute('alt')||'').toLowerCase();
      var cls = (el.className||'').toLowerCase();
      var eid = (el.id||'').toLowerCase();
      var combined = src+' '+alt+' '+cls+' '+eid;
      // Must have captcha signal
      if (!['captcha','securimage','verify','security_code','chk','random','num']
          .some(function(s){ return combined.indexOf(s) !== -1; })) return false;
      // Reject non-captcha images
      if (['logo','icon','banner','avatar','social','facebook','twitter',
           'instagram','arrow','menu','star','badge']
          .some(function(r){ return combined.indexOf(r) !== -1; })) return false;
      // Size check: captcha images are small
      var w = el.offsetWidth || el.naturalWidth;
      var h = el.offsetHeight || el.naturalHeight;
      if (w < 20 || h < 10 || h > 200 || w > 700) return false;
      return true;
    }

    var imgEl = null, inpEl = null;

    for (var i = 0; i < IMG_SELS.length && !imgEl; i++) {
      var els = document.querySelectorAll(IMG_SELS[i]);
      for (var j = 0; j < els.length; j++) {
        if (els[j].offsetParent !== null && isCaptchaImg(els[j])) {
          imgEl = els[j]; break;
        }
      }
    }
    for (var k = 0; k < INP_SELS.length && !inpEl; k++) {
      var inps = document.querySelectorAll(INP_SELS[k]);
      for (var l = 0; l < inps.length; l++) {
        if (inps[l].offsetParent !== null) { inpEl = inps[l]; break; }
      }
    }

    if (!imgEl || !inpEl) return null;
    return {
      img: imgEl, inp: inpEl,
      src: imgEl.src || imgEl.getAttribute('src') || '',
      w: imgEl.offsetWidth, h: imgEl.offsetHeight
    };
  `, IMG_SELS, INP_SELS).catch(() => null);
}

// ── Fetch + preprocess image via canvas (multiple variants) ───────────────────
async function fetchAndPreprocess(driver, imgSrc) {
  // Returns array of base64 PNG strings (different preprocessing variants)
  return await driver.executeAsyncScript(`
    var src  = arguments[0];
    var done = arguments[arguments.length - 1];

    function processImage(imgEl) {
      var W = (imgEl.naturalWidth  || imgEl.width  || 200) * 3;
      var H = (imgEl.naturalHeight || imgEl.height || 60)  * 3;
      var variants = [];

      function makeVariant(filter) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        ctx.filter = filter;
        ctx.drawImage(imgEl, 0, 0, W, H);
        return c.toDataURL('image/png').split(',')[1];
      }

      // Variant 1: high contrast grayscale (best for most captchas)
      variants.push(makeVariant('contrast(300%) brightness(120%) grayscale(100%)'));
      // Variant 2: inverted (dark background captchas)
      variants.push(makeVariant('contrast(300%) invert(100%) grayscale(100%)'));
      // Variant 3: extreme contrast
      variants.push(makeVariant('contrast(500%) grayscale(100%)'));
      // Variant 4: original scaled up
      variants.push(makeVariant('none'));

      done(variants);
    }

    // If data URI, use directly
    if (src.startsWith('data:')) {
      var img = new Image();
      img.onload = function() { processImage(img); };
      img.src = src;
      return;
    }

    // Fetch with credentials
    fetch(src, { credentials: 'include' })
      .then(function(r) { return r.blob(); })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function() {
          URL.revokeObjectURL(url);
          processImage(img);
        };
        img.onerror = function() { done(null); };
        img.src = url;
      })
      .catch(function() { done(null); });
  `, imgSrc).catch(() => null);
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

  // Vote: pick most frequent, break ties by highest confidence
  const freq = {};
  const conf = {};
  for (const r of allResults) {
    freq[r.text] = (freq[r.text] || 0) + 1;
    conf[r.text] = Math.max(conf[r.text] || 0, r.confidence);
  }

  const best = Object.keys(freq).sort((a, b) => {
    if (freq[b] !== freq[a]) return freq[b] - freq[a];
    return conf[b] - conf[a];
  })[0];

  console.log(`      🔤 OCR result: "${best}" (${freq[best]}/${allResults.length} votes, conf=${conf[best].toFixed(0)})`);
  console.log(`      📊 All variants: ${[...new Set(allResults.map(r => r.text))].join(', ')}`);
  return best;
}

// ── Python fallback OCR (better for complex captchas) ────────────────────────
function ocrWithPython(imagePath) {
  const PYTHON = process.env.PYTHON || '/home/ubuntu/Captch-Solver-Contact-Form/.venv/bin/python';
  const script = `
import sys, re
from PIL import Image, ImageFilter, ImageEnhance
import pytesseract

img = Image.open(sys.argv[1]).convert('L')
# Scale up 3x
w, h = img.size
img = img.resize((w*3, h*3), Image.LANCZOS)

results = []
for thresh in [100, 128, 150]:
    for invert in [False, True]:
        v = img.point(lambda p: 255 if p > thresh else 0)
        if invert: v = v.point(lambda p: 255 - p)
        v = v.filter(ImageFilter.SHARPEN)
        for psm in ['7','8','6']:
            t = pytesseract.image_to_string(v, config=f'--psm {psm} --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
            t = re.sub(r'[^A-Za-z0-9]', '', t).strip()
            if 3 <= len(t) <= 10: results.append(t)

if results:
    from collections import Counter
    print(Counter(results).most_common(1)[0][0])
else:
    print('')
`.trim();

  try {
    const result = execFileSync(PYTHON, ['-c', script, imagePath], {
      timeout: 30000, encoding: 'utf8',
    }).trim();
    if (result) console.log(`      🐍 Python OCR: "${result}"`);
    return result;
  } catch (_) { return ''; }
}

// ── Type answer into captcha input ────────────────────────────────────────────
async function typeAnswer(driver, inpEl, text) {
  await driver.executeScript(`
    var el = arguments[0], val = arguments[1];
    el.scrollIntoView({block:'center'});
    el.focus();
    // Clear existing value
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
    if (setter && setter.set) setter.set.call(el, '');
    else el.value = '';
    el.dispatchEvent(new Event('input', {bubbles:true}));
    // Set new value
    if (setter && setter.set) setter.set.call(el, val);
    else el.value = val;
    ['input','change','blur'].forEach(function(t){
      el.dispatchEvent(new Event(t, {bubbles:true}));
    });
  `, inpEl, text);
  console.log(`      ✅ Typed CAPTCHA answer: "${text}"`);
}

// ── Reload captcha image ──────────────────────────────────────────────────────
async function reloadCaptcha(driver) {
  try {
    const done = await driver.executeScript(`
      // Try reload button
      var sels = ['[id*="reload" i]','[class*="reload" i]','[id*="refresh" i]',
                  '[class*="refresh" i]','a[href*="captcha" i]','[onclick*="captcha" i]'];
      for (var i=0; i<sels.length; i++) {
        var el = document.querySelector(sels[i]);
        if (el && el.offsetParent !== null) { el.click(); return 'clicked'; }
      }
      // Force reload by changing img src
      var imgs = document.querySelectorAll(
        'img[src*="captcha" i],img[src*="securimage" i],img[src*="verify" i]');
      if (imgs.length) {
        var src = imgs[0].getAttribute('src') || '';
        var sep = src.indexOf('?') !== -1 ? '&' : '?';
        imgs[0].src = src + sep + '_t=' + Date.now();
        return 'reloaded';
      }
      return null;
    `);
    if (done) { await sleep(1200); return true; }
  } catch (_) {}
  return false;
}

// ── Math CAPTCHA solver ──────────────────────────────────────────────────────
// Handles: "2 + 3 = ?", "What is 5 × 4?", "seven plus three", etc.
const MATH_INP_SELS = [
  "input[name*='captcha' i]","input[id*='captcha' i]",
  "input[name*='math' i]",   "input[id*='math' i]",
  "input[name*='calc' i]",   "input[id*='calc' i]",
  "input[name*='answer' i]", "input[id*='answer' i]",
  "input[name*='result' i]", "input[id*='result' i]",
  "input[name*='sum' i]",    "input[id*='sum' i]",
  "input[name*='spam' i]",   "input[id*='spam' i]",
  "input[name*='verify' i]", "input[id*='verify' i]",
  "input[name*='human' i]",  "input[id*='human' i]",
];

const WORD_NUMS = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
  sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
};

function solveMathExpr(text) {
  let t = text.toLowerCase().trim();
  // Replace word numbers
  for (const [word, num] of Object.entries(WORD_NUMS)) {
    t = t.replace(new RegExp('\\b' + word + '\\b', 'g'), String(num));
  }
  // Replace word operators
  t = t.replace(/\bplus\b/g,'+').replace(/\bminus\b/g,'-')
       .replace(/\btimes\b|\bmultiplied by\b|\bx\b/g,'*')
       .replace(/\bdivided by\b/g,'/').replace(/[×]/g,'*').replace(/[÷]/g,'/');
  // Extract math expression
  const m = t.match(/(-?\d+)\s*([+\-*/])\s*(-?\d+)/);
  if (!m) return null;
  const a = parseInt(m[1]), op = m[2], b = parseInt(m[3]);
  if (isNaN(a) || isNaN(b)) return null;
  switch(op) {
    case '+': return String(a + b);
    case '-': return String(a - b);
    case '*': return String(a * b);
    case '/': return b !== 0 ? String(Math.round(a / b)) : null;
  }
  return null;
}

async function solveMathCaptcha(driver) {
  // CF7 Quiz — fetch question via CF7 REST API or label text
  try {
    const cf7 = await driver.executeAsyncScript(function() {
      var done = arguments[arguments.length - 1];
      var inputs = Array.from(document.querySelectorAll('input.wpcf7-quiz,[name*="quiz-"]'));
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        if (inp.offsetParent === null) continue;
        var lbl = inp.closest('label');
        var question = '';
        if (lbl) {
          var span = lbl.querySelector('.wpcf7-quiz-label');
          question = span ? span.innerText.trim() : lbl.innerText.trim();
        }
        if (!question && inp.id) {
          var l2 = document.querySelector('label[for="' + inp.id + '"]');
          if (l2) question = l2.innerText.trim();
        }
        if (!question) {
          var par = inp.parentElement;
          if (par) question = par.innerText.trim();
        }
        if (question) { done({ inp: inp, question: question }); return; }
      }
      // Fetch via CF7 REST API
      var formEl = document.querySelector('.wpcf7');
      var formId = formEl ? (formEl.getAttribute('data-id') || '') : '';
      if (!formId) { done(null); return; }
      var root = (window.wpcf7 && window.wpcf7.api && window.wpcf7.api.root) || '/wp-json/';
      fetch(root + 'contact-form-7/v1/contact-forms/' + formId + '?context=edit', { credentials: 'include' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var content = (data && data.properties && data.properties.form && data.properties.form.body) || '';
          var match = content.match(/quiz[^"]*"([^"]+)"/);
          var question = match ? match[1] : '';
          var inp2 = document.querySelector('input.wpcf7-quiz,[name*="quiz-"]');
          done(question && inp2 ? { inp: inp2, question: question } : null);
        })
        .catch(function() { done(null); });
    });
    if (cf7 && cf7.question) {
      console.log(`      🔢 CF7 Quiz: "${cf7.question.slice(0,80)}"`);

      // Try math first
      const mathAnswer = solveMathExpr(cf7.question);
      if (mathAnswer !== null) {
        console.log(`      ✅ Math answer: ${mathAnswer}`);
        await typeAnswer(driver, cf7.inp, mathAnswer);
        return true;
      }

      // Extract answer directly from label text
      // Pattern: "Enter X" or "Type X" or "Enter: X" where X is the answer
      const directMatch = cf7.question.match(
        /(?:enter|type|write|input|spam check[:\s]+enter)[:\s]+([\w@#$%^&*!]+)/i
      );
      if (directMatch) {
        const answer = directMatch[1].trim();
        console.log(`      ✅ Direct answer from label: "${answer}"`);
        await typeAnswer(driver, cf7.inp, answer);
        return true;
      }

      // Last word in label is often the answer for "Spam Check Enter s3oc0mpany"
      const words = cf7.question.trim().split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord && lastWord.length >= 3 && !/^(the|and|or|is|a|an|to|for|of)$/i.test(lastWord)) {
        console.log(`      ✅ Last word answer: "${lastWord}"`);
        await typeAnswer(driver, cf7.inp, lastWord);
        return true;
      }
    }
  } catch (_) {}

  const found = await driver.executeScript(function() {
    function hasMath(text) {
      var t = (text||'').toLowerCase();
      return /\d+\s*[+\-*\/x×÷]\s*\d+/.test(t) ||
             /(plus|minus|times|divided|multiplied)/.test(t);
    }
    function getDirectLabel(el) {
      // Only check DIRECT label — not grandparent which may contain other fields
      if (el.id) { var l=document.querySelector('label[for="'+el.id+'"]'); if(l) return l.innerText.trim(); }
      var a=el.getAttribute('aria-label'); if(a) return a.trim();
      if (el.placeholder && hasMath(el.placeholder)) return el.placeholder;
      // Parent text only (not grandparent)
      var par=el.parentElement;
      if(par) return par.innerText.trim();
      return '';
    }
    var inputs = Array.from(document.querySelectorAll('input[type=text],input[type=number],input:not([type])'));
    for (var i=0; i<inputs.length; i++) {
      var el=inputs[i];
      if (el.offsetParent===null) continue;
      var directLabel = getDirectLabel(el);
      // Must have math in DIRECT label/parent only
      if (hasMath(directLabel)) {
        return { inp: el, question: directLabel };
      }
    }
    // Second pass: check by id/name (math-captcha, human, spam, answer)
    for (var m=0; m<inputs.length; m++) {
      var em=inputs[m];
      if (em.offsetParent===null) continue;
      var nm=(em.name||'').toLowerCase(), idm=(em.id||'').toLowerCase();
      if (/math|captcha|human|spam|answer|verify/.test(nm+' '+idm)) {
        var parText2 = em.parentElement ? em.parentElement.innerText.trim() : '';
        if (hasMath(parText2) || hasMath(nm+' '+idm)) {
          return { inp: em, question: parText2 || nm };
        }
      }
    }
    // Third pass: check label[for] text which may say "Enter the correct answer"
    // and parent has the actual math expression
    for (var j=0; j<inputs.length; j++) {
      var el2=inputs[j];
      if (el2.offsetParent===null) continue;
      var lbl = '';
      if (el2.id) { var l2=document.querySelector('label[for="'+el2.id+'"]'); if(l2) lbl=l2.innerText.trim(); }
      var par2 = el2.parentElement;
      var parText = par2 ? par2.innerText.trim() : '';
      // Label says "answer" AND parent has math
      if (/answer|correct|captcha|verify|human|spam/i.test(lbl) && hasMath(parText)) {
        return { inp: el2, question: parText };
      }
    }
    return null;
  }).catch(() => null);

  if (!found || !found.question) return false;

  const question = found.question.trim();
  console.log(`      🔢 Math: "${question.slice(0,60)}"`);

  const answer = solveMathExpr(question);
  if (answer === null) {
    console.log(`      ⚠️ Cannot parse: "${question.slice(0,60)}"`);
    return false;
  }

  console.log(`      ✅ Answer: ${answer}`);
  await typeAnswer(driver, found.inp, answer);
  return true;
}

// ── Main solver ───────────────────────────────────────────────────────────────
async function solveImageCaptcha(driver) {
  // Try math CAPTCHA first (text-based question like "2 + 3 = ?")
  const mathSolved = await solveMathCaptcha(driver);
  if (mathSolved) return true;

  // Then try image OCR CAPTCHA
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`      🔄 Image CAPTCHA retry ${attempt}/3...`);
      await reloadCaptcha(driver);
    }

    // Find captcha image + input
    const found = await findCaptcha(driver);
    if (!found) {
      if (attempt === 1) console.log('      ℹ️ No image CAPTCHA found');
      return false;
    }

    const { img: imgEl, inp: inpEl, src: imgSrc, w, h } = found;
    if (!imgSrc) { console.log('      ⚠️ Captcha image has no src'); return false; }

    console.log(`      🖼️ Image CAPTCHA: ${imgSrc.slice(0, 60)} (${w}×${h}px)`);

    // Fetch + preprocess (4 variants via canvas)
    const variants = await fetchAndPreprocess(driver, imgSrc);

    let text = '';

    if (variants && variants.length) {
      const buffers = variants.map(b64 => Buffer.from(b64, 'base64'));
      console.log(`      📡 Running OCR on ${buffers.length} image variants...`);
      text = await ocrVariants(buffers);

      // Python fallback if Tesseract.js fails or gives short result
      if (!text || text.length < 3) {
        console.log('      🐍 Tesseract.js uncertain — trying Python OCR...');
        const tmpFile = path.join(os.tmpdir(), `cap_py_${Date.now()}.png`);
        try {
          fs.writeFileSync(tmpFile, buffers[0]); // use high-contrast variant
          text = ocrWithPython(tmpFile);
        } finally {
          try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
      }
    } else {
      // Canvas fetch failed — take screenshot directly
      console.log('      📸 Canvas fetch failed — using element screenshot...');
      try {
        const png = await driver.executeScript(`
          var img = arguments[0];
          var c = document.createElement('canvas');
          c.width  = (img.naturalWidth  || img.offsetWidth  || 150) * 3;
          c.height = (img.naturalHeight || img.offsetHeight || 50)  * 3;
          var ctx = c.getContext('2d');
          ctx.filter = 'contrast(300%) grayscale(100%)';
          ctx.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/png').split(',')[1];
        `, imgEl);
        if (png) {
          const buf = Buffer.from(png, 'base64');
          text = await ocrVariants([buf]);
        }
      } catch (_) {}
    }

    if (!text) {
      console.log(`      ⚠️ OCR empty (attempt ${attempt}/3)`);
      continue;
    }

    // Type answer
    try {
      await typeAnswer(driver, inpEl, text);
      return true;
    } catch (e) {
      console.log(`      ⚠️ Type failed: ${e.message?.slice(0, 80)}`);
      return false;
    }
  }

  console.log('      ⚠️ Image CAPTCHA failed after 3 attempts');
  return false;
}

process.on('exit', () => {
  if (_worker) _worker.terminate().catch(() => {});
});

module.exports = { solveImageCaptcha, solveMathCaptcha, solveMathExpr };
