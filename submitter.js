'use strict';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── All possible submit button signals ───────────────────────────────────────
const SIGNALS = [
  // English
  'send','submit','send message','send inquiry','send enquiry','send request',
  'contact us','get in touch','request','enquire','inquire','get quote',
  'book now','book appointment','schedule','apply','apply now',
  'talk to us','reach out','yes send','send it','go','confirm','ok','done',
  'get started','let\'s talk','lets talk','drop us a line','write to us',
  'request appointment','request consultation','request info','request callback',
  'send form','submit form','submit request','submit inquiry',
  // Spanish/French/German/Italian
  'enviar','envoyer','senden','invia','verzenden','soumettre','absenden',
  // Generic
  'next','continue','proceed',
];

const REJECTS = [
  'cancel','reset','clear','back','previous','close','login','sign in',
  'register','search','filter','checkout','pay','download','upload',
  'edit','delete','remove','share','print','add to cart','open toolbar',
  'increase text','decrease text','grayscale','contrast','readable font',
  'links underline','negative contrast','light background','high contrast',
  'reset settings','accessibility',
];

// ── Score a button element ────────────────────────────────────────────────────
function scoreButton(el, form, signals, rejects) {
  var r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return -1;
  if (el.disabled) return -1;

  var type  = (el.type  || '').toLowerCase();
  var name  = (el.name  || '').toLowerCase();
  var id    = (el.id    || '').toLowerCase();
  var cls   = (el.className || '').toLowerCase();
  var val   = (el.value || '').toLowerCase();
  var aria  = (el.getAttribute('aria-label') || '').toLowerCase();
  var title = (el.title || '').toLowerCase();
  var text  = (el.innerText || el.textContent || '').trim().toLowerCase();
  if (!text) text = val || aria || title;
  var combo = text + ' ' + name + ' ' + id + ' ' + cls + ' ' + val + ' ' + aria;

  // Hard reject
  if (rejects.some(function(r) { return combo.indexOf(r) !== -1; })) return -1;

  var score = 0;

  // Type signals
  if (type === 'submit') score += 40;
  if (type === 'image')  score += 15;  // image submit buttons

  // Text match
  if (signals.some(function(s) { return text === s; }))              score += 30;
  else if (signals.some(function(s) { return text.indexOf(s) !== -1; })) score += 20;

  // Name/id/class hints
  if (['submit','send','contact','request','enquir','inquir','book','apply','go']
      .some(function(h) {
        return name.indexOf(h)!==-1 || id.indexOf(h)!==-1 || cls.indexOf(h)!==-1;
      })) score += 15;

  // Inside the form = strong signal
  if (el.closest && el.closest('form') === form) score += 25;

  // Visible in viewport
  if (r.top >= 0 && r.top < window.innerHeight) score += 5;

  // Has text (not empty button)
  if (text.length > 0) score += 5;

  return score;
}

// ── Human-like click: scroll → focus → mousedown → mouseup → click ───────────
async function humanClick(driver, el) {
  await driver.executeScript(function(el) {
    // Scroll into view
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, el);
  await sleep(300);

  // Try Selenium click first (most natural)
  try {
    await el.click();
    return true;
  } catch (_) {}

  // JS click with mouse events
  try {
    await driver.executeScript(function(el) {
      var r = el.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top  + r.height / 2;
      ['mouseover','mouseenter','mousemove','mousedown','mouseup','click'].forEach(function(t) {
        el.dispatchEvent(new MouseEvent(t, {
          bubbles: true, cancelable: true,
          clientX: x, clientY: y,
          screenX: x + window.screenX, screenY: y + window.screenY,
        }));
      });
    }, el);
    return true;
  } catch (_) {}

  return false;
}

// ── Main submit function ──────────────────────────────────────────────────────
async function submitForm(driver, form, record) {
  console.log('   🚀 Submitting form...');

  // Collect ALL candidate buttons from page using inline function
  let scored = [];
  try {
    scored = await driver.executeScript(function(form, signals, rejects) {
      function scoreButton(el, form, signals, rejects) {
        var r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return -1;
        if (el.disabled) return -1;
        var type  = (el.type  || '').toLowerCase();
        var name  = (el.name  || '').toLowerCase();
        var id    = (el.id    || '').toLowerCase();
        var cls   = (el.className || '').toLowerCase();
        var val   = (el.value || '').toLowerCase();
        var aria  = (el.getAttribute('aria-label') || '').toLowerCase();
        var text  = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (!text) text = val || aria || (el.title||'').toLowerCase();
        var combo = text+' '+name+' '+id+' '+cls+' '+val+' '+aria;
        if (rejects.some(function(r){ return combo.indexOf(r)!==-1; })) return -1;
        var score = 0;
        if (type==='submit') score += 40;
        if (type==='image')  score += 15;
        if (signals.some(function(s){ return text===s; }))               score += 30;
        else if (signals.some(function(s){ return text.indexOf(s)!==-1; })) score += 20;
        if (['submit','send','contact','request','enquir','inquir','book','apply','go']
            .some(function(h){ return name.indexOf(h)!==-1||id.indexOf(h)!==-1||cls.indexOf(h)!==-1; })) score += 15;
        if (el.closest && el.closest('form')===form) score += 25;
        if (r.top>=0 && r.top<window.innerHeight) score += 5;
        if (text.length>0) score += 5;
        return score;
      }

      var seen = new Set(), cands = [];
      function add(el) {
        if (!seen.has(el) && el.offsetParent!==null) { seen.add(el); cands.push(el); }
      }

      // Priority 1: inside form
      Array.from(form.querySelectorAll(
        "button, input[type='submit'], input[type='button'], input[type='image'], a[role='button']"
      )).forEach(add);

      // Priority 2: parent container
      var p = form.parentElement;
      if (p) Array.from(p.querySelectorAll(
        "button, input[type='submit'], input[type='button']"
      )).forEach(add);

      // Priority 3: page-level (for forms where button is outside)
      Array.from(document.querySelectorAll(
        "button[type='submit'], input[type='submit']"
      )).forEach(add);

      // Priority 4: any visible button on page
      Array.from(document.querySelectorAll('button')).forEach(add);

      var results = [];
      cands.forEach(function(el, i) {
        var s = scoreButton(el, form, signals, rejects);
        if (s > 0) results.push({ el: el, score: s,
          text: (el.innerText||el.value||el.getAttribute('aria-label')||'').trim().slice(0,40) });
      });
      results.sort(function(a,b){ return b.score-a.score; });
      return results;
    }, form, SIGNALS, REJECTS) || [];
  } catch (_) {}

  console.log(`      Found ${scored.length} submit candidates`);

  // Try clicking top candidates
  for (const { el, score, text } of scored) {
    if (score < 10) break;
    console.log(`      Trying: '${text}' (score=${score})`);
    try {
      const clicked = await humanClick(driver, el);
      if (clicked) {
        await sleep(400);
        console.log(`      ✅ Clicked: '${text}' (score=${score})`);
        record.submit_status = `Clicked: '${text}' (score=${score})`;
        return [true, null];
      }
    } catch (_) {}
  }

  // Fallback A: dispatch submit event on form
  try {
    const r = await driver.executeScript(function(form) {
      var evt = new Event('submit', { bubbles: true, cancelable: true });
      var ok = form.dispatchEvent(evt);
      if (ok) { try { form.submit(); return 'submit-event'; } catch(_) { return 'event-only'; } }
      return 'prevented';
    }, form);
    if (r !== 'prevented') {
      console.log(`      ✅ Submit event (${r})`);
      record.submit_status = `Submit event: ${r}`;
      return [true, null];
    }
  } catch (_) {}

  // Fallback B: form.submit() on best matching form
  try {
    const r = await driver.executeScript(function() {
      var forms = Array.from(document.querySelectorAll('form'));
      // Sort by number of filled inputs
      forms.sort(function(a,b){
        return b.querySelectorAll('input[value],textarea').length -
               a.querySelectorAll('input[value],textarea').length;
      });
      for (var i=0; i<forms.length; i++) {
        var f = forms[i];
        var inp = f.querySelectorAll('input,textarea,select');
        var hasEmail = Array.from(inp).some(function(e){
          return e.type==='email' || (e.name||'').toLowerCase().indexOf('email')!==-1;
        });
        if (hasEmail || inp.length >= 2) {
          try { f.submit(); return 'form['+i+']'; } catch(_) {}
        }
      }
      return null;
    });
    if (r) {
      console.log(`      ✅ form.submit() → ${r}`);
      record.submit_status = `form.submit(): ${r}`;
      return [true, null];
    }
  } catch (_) {}

  // Fallback C: Enter key on last filled input
  try {
    const last = await driver.executeScript(function(form) {
      var inp = Array.from(form.querySelectorAll(
        "input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='submit']):not([type='button'])"));
      var vis = inp.filter(function(e){ return e.offsetParent!==null && !e.disabled && e.value; });
      return vis.length ? vis[vis.length-1] : null;
    }, form);
    if (last) {
      await driver.executeScript(function(el) {
        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
        el.dispatchEvent(new KeyboardEvent('keyup',   {key:'Enter',keyCode:13,bubbles:true}));
      }, last);
      console.log('      ✅ Enter key on last input');
      record.submit_status = 'Enter key';
      return [true, null];
    }
  } catch (_) {}

  console.log('      ❌ No submit method worked');
  record.submit_status = 'No submit button found';
  return [false, 'No submit button'];
}

// ── Success detection ─────────────────────────────────────────────────────────
const SUCCESS_TEXTS = [
  'thank you','thanks for','success','successfully submitted','form submitted',
  'message sent','message received','we will contact','we will get back',
  'we have received','received your','get back to you','be in touch',
  'confirmation','your submission','inquiry received','enquiry received',
  'request received','we received your',
  'gracias','enviado','obrigado','merci','danke',
];
// These are STRONG signals — any match = success
const SUCCESS_SELS = [
  '.wpcf7-mail-sent-ok',
  '.elementor-message-success',
  '.gform_confirmation_message',
  '.wpforms-confirmation',
  '.nf-response-msg',
  '.frm_message',
  '.alert-success',
  '.success-message',
  '.form-success',
  '.submission-success',
  '[class*="confirmation"]',
  '[class*="thank-you"]',
  '[class*="thankyou"]',
  '#gform_confirmation_message',
];
// Weak signals — only count if text also matches
const WEAK_SELS = [
  '[class*="success"]',
  '[class*="thank"]',
  '[class*="confirm"]',
  '#result','#message','#response',
  '.wpcf7-response-output',
];

async function detectSuccess(driver) {
  const startUrl = await driver.getCurrentUrl().catch(() => '');

  const check = async () => {
    try {
      return await driver.executeScript(function(startUrl, texts, strongSels, weakSels) {
        var body = (document.body && document.body.innerText || '').toLowerCase();
        var url  = window.location.href;

        // URL changed to thank-you/success page
        if (url !== startUrl) {
          var u = url.toLowerCase();
          if (["thank","success","confirm","sent","received","submitted"].some(function(w){ return u.indexOf(w)!==-1; }))
            return true;
          return true; // any redirect after submit = success
        }

        // Strong selectors — definitive success
        for (var i=0; i<strongSels.length; i++) {
          try {
            var nodes = document.querySelectorAll(strongSels[i]);
            for (var j=0; j<nodes.length; j++) {
              if (nodes[j].offsetParent!==null && (nodes[j].innerText||'').trim().length > 2)
                return true;
            }
          } catch(_){}
        }

        // Body text — strong phrases only
        if (texts.some(function(t){ return body.indexOf(t)!==-1; })) return true;

        // Weak selectors — only if text also matches
        for (var k=0; k<weakSels.length; k++) {
          try {
            var wnodes = document.querySelectorAll(weakSels[k]);
            for (var l=0; l<wnodes.length; l++) {
              var n = wnodes[l];
              if (n.offsetParent!==null) {
                var t = (n.innerText||'').toLowerCase();
                if (t.length > 5 && texts.some(function(s){ return t.indexOf(s)!==-1; }))
                  return true;
              }
            }
          } catch(_){}
        }
        return false;
      }, startUrl, SUCCESS_TEXTS, SUCCESS_SELS, WEAK_SELS);
    } catch(_){ return false; }
  };

  // Poll up to 10s waiting for confirmation
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await check()) return true;
  }
  return false;
}


module.exports = { submitForm, detectSuccess };
