'use strict';

const { By } = require('selenium-webdriver');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { spawn } = require('child_process');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(a, b) { return Math.random() * (b - a) + a; }

// ── Whisper persistent server ─────────────────────────────────────────────────
let _proc = null, _ready = false;

function getWhisper() {
  if (_proc && !_proc.killed) return _proc;
  const py  = process.env.PYTHON || '/usr/bin/python3';
  const scr = path.join(__dirname, '..', 'whisper_server.py');
  console.log('      🔄 Starting Whisper...');
  _proc  = spawn(py, [scr], { stdio: ['pipe','pipe','pipe'] });
  _ready = false;
  _proc.stderr.on('data', d => {
    const m = d.toString().trim();
    if (m.includes('model loaded')) _ready = true;
    console.log(`      [whisper] ${m}`);
  });
  _proc.on('exit', () => { _proc = null; _ready = false; });
  return _proc;
}

async function transcribe(audioPath) {
  const size = fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0;
  if (size < 500) { console.log('      ⚠️ Audio too small'); return ''; }
  console.log(`      🔍 Transcribing ${size} bytes...`);
  return new Promise(resolve => {
    try {
      const proc = getWhisper();
      const wait = cb => {
        if (_ready) return cb();
        let w = 0;
        const iv = setInterval(() => { w += 300; if (_ready || w > 90000) { clearInterval(iv); cb(); } }, 300);
      };
      wait(() => {
        let buf = '';
        const onData = d => {
          buf += d.toString();
          if (buf.includes('\n')) {
            proc.stdout.off('data', onData);
            const t = buf.split('\n')[0].trim();
            console.log(`      🗣️  Whisper: "${t}"`);
            resolve(t);
          }
        };
        proc.stdout.on('data', onData);
        proc.stdin.write(audioPath + '\n');
        setTimeout(() => { proc.stdout.off('data', onData); console.log('      ⚠️ Whisper timeout'); resolve(''); }, 60000);
      });
    } catch (e) { console.log(`      ⚠️ ${e.message}`); resolve(''); }
  });
}

setTimeout(() => { try { getWhisper(); } catch (_) {} }, 200);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sw(driver) { try { await driver.switchTo().defaultContent(); } catch (_) {} }

async function isSolved(driver) {
  try {
    await sw(driver);
    for (const t of await driver.findElements(By.css("textarea[name='g-recaptcha-response']")))
      if ((await t.getAttribute('value') || '').trim()) return true;
    for (const f of await driver.findElements(By.css("iframe[src*='recaptcha'][src*='anchor']"))) {
      if ((await f.getRect()).width < 60) continue;
      try {
        await driver.switchTo().frame(f);
        const c = await driver.findElements(By.css(".recaptcha-checkbox-checked,[aria-checked='true']"));
        await sw(driver);
        if (c.length) return true;
      } catch (_) { await sw(driver); }
    }
  } catch (_) { await sw(driver); }
  return false;
}

async function isRateLimited(driver) {
  try {
    const b = await driver.executeScript("return document.body ? document.body.innerText.toLowerCase() : '';") || '';
    return ['try again later','too many requests','unusual activity','automated queries',
            'cannot process your request','protect our users'].some(p => b.includes(p));
  } catch (_) { return false; }
}

async function clickEl(driver, el) {
  try {
    await driver.executeScript(function(el) {
      el.scrollIntoView({ block: 'center' });
      var r = el.getBoundingClientRect();
      var x = r.left + r.width/2 + (Math.random()*6-3);
      var y = r.top  + r.height/2 + (Math.random()*6-3);
      ['mouseover','mousedown','mouseup','click'].forEach(function(t) {
        el.dispatchEvent(new MouseEvent(t, { bubbles:true, cancelable:true, clientX:x, clientY:y }));
      });
    }, el);
    await sleep(rand(200, 400));
    return true;
  } catch (_) {
    try { await driver.executeScript('arguments[0].click();', el); return true; } catch (_2) { return false; }
  }
}

async function reload(driver) {
  try {
    const rb = await driver.findElement(By.css('#recaptcha-reload-button,[id*="reload"],.rc-button-reload'));
    await driver.executeScript('arguments[0].click();', rb);
    await sleep(2000);
    return true;
  } catch (_) { return false; }
}

async function getAudioUrl(driver) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    try {
      const url = await driver.executeScript(function() {
        var sels = ['#audio-source','a.rc-audiochallenge-tdownload-link','[id*="audio-source"]','audio[src]','audio source[src]'];
        for (var i=0; i<sels.length; i++) {
          var el = document.querySelector(sels[i]);
          if (el) { var s = el.src||el.href||el.getAttribute('src')||el.getAttribute('href')||''; if (s && s.startsWith('http')) return s; }
        }
        return null;
      });
      if (url) return url;
    } catch (_) {}
    await sleep(400);
  }
  return null;
}

async function fetchAudio(driver, url) {
  try {
    return await driver.executeAsyncScript(function() {
      var url = arguments[0], done = arguments[arguments.length-1];
      fetch(url, { credentials: 'include' })
        .then(function(r) { return r.arrayBuffer(); })
        .then(function(buf) {
          var b = new Uint8Array(buf), s = '';
          for (var i=0; i<b.byteLength; i++) s += String.fromCharCode(b[i]);
          done(btoa(s));
        })
        .catch(function() { done(null); });
    }, url);
  } catch (_) { return null; }
}

// ── Click audio button (works from image challenge too) ───────────────────────
async function clickAudioButton(driver) {
  // Try all known selectors
  for (const sel of [
    '#recaptcha-audio-button', 'button.rc-button-audio',
    '[id*="audio-button"]', 'button[aria-labelledby*="audio"]',
    'button[title*="audio" i]',
  ]) {
    try {
      const btn = await driver.findElement(By.css(sel));
      if (await btn.isDisplayed()) {
        await clickEl(driver, btn);
        console.log('      🔊 Clicked audio button');
        return true;
      }
    } catch (_) {}
  }
  // Fallback: any button with 'audio' in attributes
  for (const btn of await driver.findElements(By.tagName('button'))) {
    try {
      const attrs = [
        await btn.getAttribute('id') || '',
        await btn.getAttribute('class') || '',
        await btn.getAttribute('title') || '',
        await btn.getAttribute('aria-label') || '',
      ].join(' ').toLowerCase();
      if (attrs.includes('audio') && await btn.isDisplayed()) {
        await clickEl(driver, btn);
        console.log('      🔊 Clicked audio button (fallback)');
        return true;
      }
    } catch (_) {}
  }
  return false;
}

// ── Main solver ───────────────────────────────────────────────────────────────
async function solveRecaptchaAudio(driver) {
  try {
    await sw(driver);

    // 1. Find anchor iframe — wait up to 8s for it to appear (post-submit captcha loads late)
    let anchor = null;
    const anchorDeadline = Date.now() + 8000;
    while (Date.now() < anchorDeadline && !anchor) {
      for (const f of await driver.findElements(By.css("iframe[src*='recaptcha'][src*='anchor']"))) {
        try { if (await f.isDisplayed() && (await f.getRect()).width >= 60) { anchor = f; break; } } catch(_) {}
      }
      if (!anchor) {
        for (const f of await driver.findElements(By.css("iframe[src*='recaptcha']"))) {
          try { if (await f.isDisplayed()) { anchor = f; break; } } catch(_) {}
        }
      }
      if (!anchor) await sleep(500);
    }
    if (!anchor) { console.log('      ⚠️ No reCAPTCHA anchor iframe'); return false; }

    // 2. Click checkbox
    try {
      await driver.switchTo().frame(anchor);
      const cb = await driver.findElement(By.css('#recaptcha-anchor,.recaptcha-checkbox-border,.recaptcha-checkbox'));
      await clickEl(driver, cb);
      console.log('      ✓ Clicked checkbox');
    } catch (e) {
      console.log(`      ⚠️ Checkbox failed: ${(e.message||'').slice(0,60)}`);
      await sw(driver); return false;
    }
    await sw(driver);
    await sleep(rand(1500, 2500));

    // 3. Already solved?
    if (await isSolved(driver)) { console.log('      ✅ Solved at checkbox!'); return true; }

    // 4. Find bframe
    let bframe = null;
    for (const f of await driver.findElements(By.css("iframe[src*='recaptcha'][src*='bframe']"))) { bframe = f; break; }
    if (!bframe) {
      for (const f of await driver.findElements(By.css("iframe[title*='recaptcha challenge'],iframe[title*='challenge']"))) { bframe = f; break; }
    }
    if (!bframe) { console.log('      ✅ Solved (no challenge)'); return true; }

    await driver.switchTo().frame(bframe);
    await sleep(1200);

    if (await isRateLimited(driver)) { console.log('      ⚠️ Rate-limited'); await sw(driver); return false; }

    // 5. Check challenge type — image or audio
    const isImage = await driver.executeScript(function() {
      return !!document.querySelector('.rc-imageselect-tile,.rc-imageselect-table,[class*="imageselect"]');
    }).catch(() => false);

    if (isImage) {
      // Image challenge — click audio button to SWITCH to audio challenge
      console.log('      🖼️ Image challenge — switching to audio...');
      const switched = await clickAudioButton(driver);
      if (!switched) {
        console.log('      ⚠️ Cannot switch to audio');
        await sw(driver); return false;
      }
      await sleep(2000);
      // Check if switched successfully
      const stillImage = await driver.executeScript(function() {
        return !!document.querySelector('.rc-imageselect-tile,.rc-imageselect-table');
      }).catch(() => true);
      if (stillImage) {
        console.log('      ⚠️ Still on image challenge');
        await sw(driver); return false;
      }
      console.log('      ✅ Switched to audio challenge');
    } else {
      // Already audio — click audio button
      const clicked = await clickAudioButton(driver);
      if (!clicked) {
        console.log('      ⚠️ Audio button not found');
        await sw(driver); return false;
      }
      await sleep(1800);
      if (await isRateLimited(driver)) { console.log('      ⚠️ Rate-limited'); await sw(driver); return false; }
    }

    // 6. Download → Whisper → type → verify (3 attempts)
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'rc_'));
    const mp3Path = path.join(tmpDir, 'audio.mp3');

    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`      📥 Attempt ${attempt}/3...`);

        const audioUrl = await getAudioUrl(driver);
        if (!audioUrl) {
          console.log(`      ⚠️ No audio URL (${attempt}/3)`);
          if (attempt < 3 && await reload(driver)) { await sleep(800); continue; }
          await sw(driver); return false;
        }
        console.log(`      🎵 ${audioUrl.slice(0,70)}...`);

        const b64 = await fetchAudio(driver, audioUrl);
        if (!b64) {
          console.log(`      ⚠️ Fetch failed (${attempt}/3)`);
          if (attempt < 3 && await reload(driver)) { await sleep(800); continue; }
          await sw(driver); return false;
        }

        const buf = Buffer.from(b64, 'base64');
        fs.writeFileSync(mp3Path, buf);
        console.log(`      📥 ${buf.length} bytes`);

        await sw(driver);
        const text = await transcribe(mp3Path);
        await driver.switchTo().frame(bframe);

        if (!text) {
          console.log(`      ⚠️ Empty transcription (${attempt}/3)`);
          if (attempt < 3 && await reload(driver)) { await sleep(800); continue; }
          await sw(driver); return false;
        }

        // Type answer char-by-char
        try {
          const ans = await driver.findElement(By.css(
            '#audio-response,.rc-audiochallenge-response-field input,input[id*="audio-response"]'));
          await driver.executeScript('arguments[0].value=""; arguments[0].focus();', ans);
          for (const ch of text) {
            await driver.executeScript(function(el, ch) {
              el.value += ch;
              el.dispatchEvent(new KeyboardEvent('keydown',  { key:ch, bubbles:true }));
              el.dispatchEvent(new KeyboardEvent('keypress', { key:ch, bubbles:true }));
              el.dispatchEvent(new InputEvent('input',       { bubbles:true }));
              el.dispatchEvent(new KeyboardEvent('keyup',    { key:ch, bubbles:true }));
            }, ans, ch);
            await sleep(rand(40, 110));
          }
          console.log(`      ✏️  Typed: "${text}"`);
          await sleep(rand(300, 500));
        } catch (e) {
          console.log(`      ⚠️ Answer input: ${(e.message||'').slice(0,60)}`);
          await sw(driver); return false;
        }

        // Click verify
        try {
          const verify = await driver.findElement(By.css(
            '#recaptcha-verify-button,button.rc-audiochallenge-verify-button,[id*="verify-button"]'));
          await clickEl(driver, verify);
          console.log(`      ✅ Submitted: "${text}"`);
        } catch (e) {
          console.log(`      ⚠️ Verify: ${(e.message||'').slice(0,60)}`);
          await sw(driver); return false;
        }

        await sleep(2000);
        await sw(driver);
        if (await isSolved(driver)) { console.log('      ✅ reCAPTCHA solved!'); return true; }

        try {
          await driver.switchTo().frame(bframe);
          if (await isRateLimited(driver)) { console.log('      ⚠️ Rate limited'); await sw(driver); return false; }
          const errs = await driver.findElements(By.css('.rc-audiochallenge-error-message,[id*="audio-error"]'));
          let hasErr = false;
          for (const e of errs) { if (await e.isDisplayed() && (await e.getText()).trim()) { hasErr = true; break; } }
          await sw(driver);
          if (hasErr) {
            console.log(`      ⚠️ Wrong answer (${attempt}/3)`);
            if (attempt < 3) { await driver.switchTo().frame(bframe); await reload(driver); await sleep(800); continue; }
            return false;
          }
          await sleep(800);
          if (await isSolved(driver)) { console.log('      ✅ Solved (delayed)!'); return true; }
          await driver.switchTo().frame(bframe);
        } catch (_) { await sw(driver); }

        if (attempt < 3) {
          try { await driver.switchTo().frame(bframe); await reload(driver); await sleep(800); }
          catch (_) { await sw(driver); }
        }
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }

    await sw(driver); return false;

  } catch (e) {
    console.log(`      ⚠️ reCAPTCHA error: ${(e.message||'').slice(0,150)}`);
    await sw(driver); return false;
  }
}

process.on('exit', () => { if (_proc) try { _proc.kill(); } catch (_) {} });

module.exports = { solveRecaptchaAudio };
