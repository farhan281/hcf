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

// Check if page already shows a thank-you / success message
async function _pageSuccess(driver) {
  try {
    await sw(driver);
    return await driver.executeScript(function() {
      var body  = (document.body ? document.body.innerText : '').toLowerCase();
      var url   = window.location.href.toLowerCase();
      var TEXTS = ['thank you','thanks for','message sent','message received',
        'successfully submitted','form submitted','we will get back',
        'we have received','received your','inquiry received','enquiry received',
        'request received','submission received','we received your'];
      var SELS  = ['.wpcf7-mail-sent-ok','.elementor-message-success',
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
    });
  } catch (_) { return false; }
}

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

    // 1. Wait longer for post-submit reCAPTCHA to fully render (up to 12s)
    await sleep(rand(1500, 2500));
    let anchor = null;
    const anchorDeadline = Date.now() + 12000;
    while (Date.now() < anchorDeadline && !anchor) {
      const candidates = [
        "iframe[src*='recaptcha'][src*='anchor']",
        "iframe[src*='google.com/recaptcha'][src*='anchor']",
        "iframe[title='reCAPTCHA']",
        "iframe[src*='recaptcha']",
      ];
      for (const sel of candidates) {
        try {
          for (const f of await driver.findElements(By.css(sel))) {
            try {
              const rect = await f.getRect();
              if (rect.width >= 50 && rect.height >= 30 && await f.isDisplayed()) {
                anchor = f; break;
              }
            } catch(_) {}
          }
        } catch(_) {}
        if (anchor) break;
      }
      if (!anchor) await sleep(600);
    }
    if (!anchor) { console.log('      ⚠️ No reCAPTCHA anchor iframe'); return false; }
    console.log('      ✅ Found anchor iframe');

    // 2. Click checkbox — try multiple selectors with retry
    let checkboxClicked = false;
    for (let cbTry = 1; cbTry <= 3 && !checkboxClicked; cbTry++) {
      try {
        await driver.switchTo().frame(anchor);
        await sleep(rand(400, 800));
        // Try all known checkbox selectors
        const cbSelectors = [
          '#recaptcha-anchor',
          '.recaptcha-checkbox-border',
          '.recaptcha-checkbox',
          '[role="checkbox"]',
          '.rc-anchor-checkbox',
          'div.recaptcha-checkbox',
          '#recaptcha-anchor-label',
          'span.recaptcha-checkbox',
        ];
        for (const sel of cbSelectors) {
          try {
            const els = await driver.findElements(By.css(sel));
            for (const cb of els) {
              try {
                if (await cb.isDisplayed()) {
                  await clickEl(driver, cb);
                  console.log(`      ✓ Clicked checkbox (${sel})`);
                  checkboxClicked = true;
                  break;
                }
              } catch(_) {}
            }
            if (checkboxClicked) break;
          } catch(_) {}
        }
        // Last resort: click center of iframe body
        if (!checkboxClicked) {
          await driver.executeScript(`
            var el = document.querySelector('#recaptcha-anchor') ||
                     document.querySelector('[role="checkbox"]') ||
                     document.body;
            if (el) {
              var r = el.getBoundingClientRect();
              el.dispatchEvent(new MouseEvent('click',{
                bubbles:true, cancelable:true,
                clientX: r.left + r.width/2,
                clientY: r.top  + r.height/2
              }));
            }
          `);
          console.log('      ✓ Clicked checkbox (JS body fallback)');
          checkboxClicked = true;
        }
      } catch (e) {
        console.log(`      ⚠️ Checkbox try ${cbTry}: ${(e.message||'').slice(0,60)}`);
      } finally {
        await sw(driver);
      }
      if (!checkboxClicked) await sleep(1000);
    }

    if (!checkboxClicked) {
      console.log('      ⚠️ Could not click checkbox after 3 tries');
      return false;
    }

    await sleep(rand(2000, 3000));

    // 3. Already solved?
    if (await isSolved(driver)) { console.log('      ✅ Solved at checkbox!'); return true; }

    // 4. Find bframe — wait up to 8s for challenge to appear
    let bframe = null;
    const bframeDeadline = Date.now() + 8000;
    while (Date.now() < bframeDeadline && !bframe) {
      for (const sel of [
        "iframe[src*='recaptcha'][src*='bframe']",
        "iframe[src*='google.com/recaptcha'][src*='bframe']",
        "iframe[title*='recaptcha challenge' i]",
        "iframe[title*='challenge' i]",
      ]) {
        try {
          const frames = await driver.findElements(By.css(sel));
          for (const f of frames) {
            try { if (await f.isDisplayed()) { bframe = f; break; } } catch(_) {}
          }
        } catch(_) {}
        if (bframe) break;
      }
      if (!bframe) await sleep(500);
    }
    if (!bframe) { console.log('      ✅ Solved (no challenge appeared)'); return true; }

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

        // Re-find bframe each attempt (new challenge = new iframe src)
        await sw(driver);
        bframe = null;
        const bfDeadline = Date.now() + 8000;
        while (Date.now() < bfDeadline && !bframe) {
          for (const sel of [
            "iframe[src*='recaptcha'][src*='bframe']",
            "iframe[src*='google.com/recaptcha'][src*='bframe']",
            "iframe[title*='recaptcha challenge' i]",
            "iframe[title*='challenge' i]",
          ]) {
            try {
              const frames = await driver.findElements(By.css(sel));
              for (const f of frames) {
                try { if (await f.isDisplayed()) { bframe = f; break; } } catch(_) {}
              }
            } catch(_) {}
            if (bframe) break;
          }
          if (!bframe) await sleep(400);
        }
        if (!bframe) {
          // Challenge may have disappeared — check if solved
          if (await isSolved(driver)) { console.log('      ✅ Solved!'); return true; }
          console.log(`      ⚠️ bframe gone (${attempt}/3)`);
          break;
        }

        await driver.switchTo().frame(bframe);
        await sleep(rand(600, 1000));

        if (await isRateLimited(driver)) { console.log('      ⚠️ Rate-limited'); await sw(driver); return false; }

        // On attempt > 1: check if we need to switch to audio again
        if (attempt > 1) {
          const needSwitch = await driver.executeScript(function() {
            return !!document.querySelector('.rc-imageselect-tile,.rc-imageselect-table,[class*="imageselect"]');
          }).catch(() => false);
          if (needSwitch) {
            console.log('      🖼️ New image challenge — switching to audio...');
            const switched = await clickAudioButton(driver);
            if (switched) await sleep(2000);
          }
        }

        const audioUrl = await getAudioUrl(driver);
        if (!audioUrl) {
          console.log(`      ⚠️ No audio URL (${attempt}/3)`);
          // Try reloading challenge
          if (attempt < 3) {
            await reload(driver);
            await sw(driver);
            await sleep(rand(1500, 2500));
            continue;
          }
          await sw(driver); return false;
        }
        console.log(`      🎵 ${audioUrl.slice(0,70)}...`);

        const b64 = await fetchAudio(driver, audioUrl);
        if (!b64) {
          console.log(`      ⚠️ Fetch failed (${attempt}/3)`);
          if (attempt < 3) { await reload(driver); await sw(driver); await sleep(rand(1000,2000)); continue; }
          await sw(driver); return false;
        }

        const buf = Buffer.from(b64, 'base64');
        fs.writeFileSync(mp3Path, buf);
        console.log(`      📥 ${buf.length} bytes`);

        await sw(driver);
        const text = await transcribe(mp3Path);

        // Re-switch to bframe after transcription
        await driver.switchTo().frame(bframe).catch(async () => {
          // bframe reference stale — re-find
          await sw(driver);
          for (const sel of ["iframe[src*='recaptcha'][src*='bframe']","iframe[title*='challenge' i]"]) {
            try {
              const frames = await driver.findElements(By.css(sel));
              for (const f of frames) {
                try { if (await f.isDisplayed()) { bframe = f; break; } } catch(_) {}
              }
            } catch(_) {}
            if (bframe) break;
          }
          if (bframe) await driver.switchTo().frame(bframe);
        });

        if (!text) {
          console.log(`      ⚠️ Empty transcription (${attempt}/3)`);
          if (attempt < 3 && await reload(driver)) { await sw(driver); await sleep(rand(1000,2000)); continue; }
          await sw(driver); return false;
        }

        // Type answer
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
            await sleep(rand(60, 130));
          }
          console.log(`      ✏️  Typed: "${text}"`);
          await sleep(rand(400, 700));
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

        // Wait for result
        await sleep(rand(2500, 3500));
        await sw(driver);

        // Check page-level success FIRST — form may have already submitted
        // before captcha appeared (nogood.io pattern)
        if (await _pageSuccess(driver)) {
          console.log('      ✅ Page shows success — captcha bypassed!');
          return true;
        }

        if (await isSolved(driver)) { console.log('      ✅ reCAPTCHA solved!'); return true; }

        // Check error / rate limit in bframe
        try {
          await driver.switchTo().frame(bframe);
          if (await isRateLimited(driver)) { console.log('      ⚠️ Rate limited'); await sw(driver); return false; }
          const errs = await driver.findElements(By.css('.rc-audiochallenge-error-message,[id*="audio-error"]'));
          let hasErr = false;
          for (const e of errs) { if (await e.isDisplayed() && (await e.getText()).trim()) { hasErr = true; break; } }
          await sw(driver);
          if (hasErr) console.log(`      ⚠️ Wrong answer (${attempt}/3) — trying next...`);
          else {
            await sleep(800);
            if (await isSolved(driver)) { console.log('      ✅ Solved (delayed)!'); return true; }
          }
        } catch (_) { await sw(driver); }
        // Loop continues to next attempt with fresh bframe lookup
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
