'use strict';

// ── Set value — works with React, Vue, Angular, plain HTML ────────────────────
const SET_VALUE_JS = `
(function(el, val) {
  el.scrollIntoView({block:'nearest'});
  el.focus();
  // Native setter for React controlled inputs
  var tag    = el.tagName;
  var proto  = tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
             : tag === 'SELECT'   ? window.HTMLSelectElement.prototype
             : window.HTMLInputElement.prototype;
  var setter = Object.getOwnPropertyDescriptor(proto, 'value');
  if (setter && setter.set) setter.set.call(el, val);
  else el.value = val;
  // Fire all events frameworks listen to
  ['input','change','blur','keyup'].forEach(function(t){
    el.dispatchEvent(new Event(t, {bubbles:true, cancelable:true}));
  });
})(arguments[0], arguments[1]);
`;

// ── Captcha inputs — never fill ───────────────────────────────────────────────
const CAPTCHA_PATTERNS = [
  'captcha','securimage','verify_code','verification_code','security_code',
  'antispam','anti_spam','bot_check','human_check','spam_check',
  'enter the code','enter code','type the code','type code','type the below','type below','math',
  'enter the correct','correct answer','spam protection','anti spam',
  'what is','calculate','solve this',
];

// ── Field matching patterns ───────────────────────────────────────────────────
const FIELD_PATTERNS = [
  ['first_name', ['first name','firstname','fname','given name','forename','first']],
  ['last_name',  ['last name','lastname','lname','surname','family name','last']],
  ['full_name',  ['full name','fullname','your name','your full name','contact name']],
  ['email',      ['email','e-mail','mail address','email address','correo']],
  ['phone',      ['phone','mobile','cell','tel','contact number','whatsapp','phone number','fax','contact no','contact_no','mob','ph no','phno','your number','number','contact']],
  ['company',    ['company','organization','organisation','business','firm','company name','practice','clinic','hospital']],
  ['website',    ['website','web site','url','site','homepage','web address']],
  ['job_title',  ['job title','position','role','designation','occupation','title','specialty','speciality']],
  ['subject',    ['subject','topic','regarding','re:','inquiry subject','message subject','purpose','reason','service','interested in','interest']],
  ['budget',     ['budget','price range','investment','spend']],
  ['address',    ['address','location','city','street','zip','postal','state']],
  ['message',    ['message','comment','description','details','how can we help','how can i help',
                  'tell us','write','notes','additional','your message','body','question',
                  'inquiry','enquiry','concern','request','info','information']],
];

function matchField(ctx, tag, type) {
  if (tag === 'textarea') return 'message';
  if (type === 'email')   return 'email';
  if (type === 'tel')     return 'phone';
  if (type === 'url')     return 'website';
  if (type === 'number' && ctx.includes('phone')) return 'phone';
  if (type === 'number' && (ctx.includes('contact') || ctx.includes('mobile') || ctx.includes('mob'))) return 'phone';
  for (const [fieldTag, keywords] of FIELD_PATTERNS) {
    if (keywords.some(k => ctx.includes(k))) return fieldTag;
  }
  return null;
}

function getPhoneValue(contact, ctx, mask, pattern, maxlength) {
  mask      = (mask      || '').toLowerCase();
  pattern   = (pattern   || '').toLowerCase();
  maxlength = parseInt(maxlength) || 0;

  // Masked input formats
  if (mask.includes('(999)') || mask.includes('(000)')) {
    return '(' + contact.phone_local.slice(0,3) + ') ' +
           contact.phone_local.slice(3,6) + '-' +
           contact.phone_local.slice(6);
  }
  if (mask.includes('999-999') || mask.includes('000-000')) {
    return contact.phone_local.slice(0,3) + '-' +
           contact.phone_local.slice(3,6) + '-' +
           contact.phone_local.slice(6);
  }
  if (mask.includes('999.999') || mask.includes('000.000')) {
    return contact.phone_local.slice(0,3) + '.' +
           contact.phone_local.slice(3,6) + '.' +
           contact.phone_local.slice(6);
  }

  // maxlength hints
  if (maxlength === 10) return contact.phone_local;           // 10 digit only
  if (maxlength === 11) return '1' + contact.phone_local;     // 11 digit with country
  if (maxlength === 12) return '+1' + contact.phone_local;    // +1XXXXXXXXXX
  if (maxlength > 0 && maxlength < 10) return contact.phone_local.slice(0, maxlength);

  // Pattern hints
  if (pattern.includes('\\d{10}')) return contact.phone_local;
  if (pattern.includes('\\d{11}')) return '1' + contact.phone_local;

  // Context hints
  const c = ctx.toLowerCase();
  if (c.includes('e164') || c.includes('+1 ')) return contact.phone;  // explicit e164
  if (c.includes('with country') || c.includes('country code')) return contact.phone;

  // Default: 10 digit local (works for most US forms)
  return contact.phone_local;
}

// ── Scan form — single JS call returns elements + metadata ────────────────────
const SCAN_JS = `
(function(form, captchaPatterns) {
  function getLabel(el) {
    // 1. label[for=id]
    if (el.id) {
      var l = document.querySelector('label[for="'+el.id+'"]');
      if (l) return l.innerText.trim();
    }
    // 2. aria-label
    var aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    // 3. aria-labelledby
    var lby = el.getAttribute('aria-labelledby');
    if (lby) {
      var parts = lby.split(/\\s+/).map(function(id){
        var lb = document.getElementById(id);
        return lb ? lb.innerText.trim() : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    // 4. wrapping label
    var wrap = el.closest('label');
    if (wrap) return wrap.innerText.replace(el.value||'','').trim();
    // 5. previous sibling
    var prev = el.previousElementSibling;
    if (prev && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes(prev.tagName) && prev.innerText)
      return prev.innerText.trim();
    // 6. parent text nodes
    var par = el.parentElement;
    if (par && par.tagName !== 'FORM') {
      var txt = Array.from(par.childNodes)
        .filter(function(n){ return n.nodeType===3; })
        .map(function(n){ return n.textContent.trim(); })
        .filter(Boolean).join(' ');
      if (txt) return txt;
    }
    // 7. fieldset legend
    var fs = el.closest('fieldset');
    if (fs) { var lg = fs.querySelector('legend'); if (lg) return lg.innerText.trim(); }
    // 8. data-label attribute
    var dl = el.getAttribute('data-label') || el.getAttribute('data-placeholder');
    if (dl) return dl.trim();
    // 9. placeholder / name / id
    return el.placeholder || el.name || el.id || '';
  }

  var inputs = Array.from(form.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button])' +
    ':not([type=image]):not([type=reset]):not([type=file]),textarea,select'
  )).filter(function(el){ return el.offsetParent !== null; });

  return inputs.map(function(el) {
    var label = getLabel(el);
    var ctx   = (label+' '+el.name+' '+el.id+' '+(el.placeholder||'')+' '+
                 (el.getAttribute('autocomplete')||'')+' '+
                 (el.getAttribute('data-label')||'')+' '+
                 (el.getAttribute('data-name')||'')).toLowerCase();
    var tag   = el.tagName.toLowerCase();
    var type  = (el.type||'text').toLowerCase();
    var style = window.getComputedStyle(el);
    var isHoneypot = style.display==='none' || style.visibility==='hidden' ||
                     style.opacity==='0' || el.tabIndex===-1 ||
                     (el.offsetWidth===0 && el.offsetHeight===0);
    var isCaptcha = captchaPatterns.some(function(p){ return ctx.indexOf(p)!==-1; });
    var opts = tag==='select'
      ? Array.from(el.options).map(function(o){
          return {value:o.value, text:o.text.trim().toLowerCase()};
        })
      : [];
    return {el:el, ctx:ctx, label:label, tag:tag, type:type,
            name:el.name||'', id:el.id||'', placeholder:el.placeholder||'',
            isHoneypot:isHoneypot, isCaptcha:isCaptcha,
            isSelect:tag==='select', options:opts};
  });
})(arguments[0], arguments[1]);
`;

// ── Main fill ─────────────────────────────────────────────────────────────────
async function fillAllFields(driver, form, contact, usedFields, filled, failed) {
  let pairs;
  try {
    pairs = await driver.executeScript(function(form, captchaPatterns) {
      function getLabel(el) {
        if (el.id) { var l=document.querySelector('label[for="'+el.id+'"]'); if(l) return l.innerText.trim(); }
        var aria=el.getAttribute('aria-label'); if(aria) return aria.trim();
        var lby=el.getAttribute('aria-labelledby');
        if(lby){ var parts=lby.split(/\s+/).map(function(id){ var lb=document.getElementById(id); return lb?lb.innerText.trim():''; }).filter(Boolean); if(parts.length) return parts.join(' '); }
        var wrap=el.closest('label'); if(wrap) return wrap.innerText.replace(el.value||'','').trim();
        var prev=el.previousElementSibling;
        if(prev&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(prev.tagName)&&prev.innerText) return prev.innerText.trim();
        var par=el.parentElement;
        if(par&&par.tagName!=='FORM'){ var txt=Array.from(par.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.textContent.trim();}).filter(Boolean).join(' '); if(txt) return txt; }
        var fs=el.closest('fieldset'); if(fs){ var lg=fs.querySelector('legend'); if(lg) return lg.innerText.trim(); }
        var dl=el.getAttribute('data-label')||el.getAttribute('data-placeholder'); if(dl) return dl.trim();
        return el.placeholder||el.name||el.id||'';
      }
      var inputs=Array.from(form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]):not([type=file]),textarea,select')).filter(function(el){return el.offsetParent!==null;});
      return inputs.map(function(el){
        var label=getLabel(el);
        var ctx=(label+' '+el.name+' '+el.id+' '+(el.placeholder||'')+' '+(el.getAttribute('autocomplete')||'')+' '+(el.getAttribute('data-label')||'')+' '+(el.getAttribute('data-name')||'')).toLowerCase();
        var tag=el.tagName.toLowerCase();
        var type=(el.type||'text').toLowerCase();
        var style=window.getComputedStyle(el);
        var isHoneypot=style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||el.tabIndex===-1||(el.offsetWidth===0&&el.offsetHeight===0);
        var isCaptcha=captchaPatterns.some(function(p){return ctx.indexOf(p)!==-1;});
        var opts=tag==='select'?Array.from(el.options).map(function(o){return{value:o.value,text:o.text.trim().toLowerCase()};}):
        [];
        var mask = el.getAttribute('data-inputmask')||el.getAttribute('data-mask')||el.getAttribute('data-inputmask-mask')||'';
        var pattern = el.getAttribute('pattern')||'';
        var maxlength = el.getAttribute('maxlength')||'';
        return{el:el,ctx:ctx,label:label,tag:tag,type:type,name:el.name||'',id:el.id||'',placeholder:el.placeholder||'',isHoneypot:isHoneypot,isCaptcha:isCaptcha,isSelect:tag==='select',options:opts,mask:mask,pattern:pattern,maxlength:maxlength};
      });
    }, form, CAPTCHA_PATTERNS);
  } catch (_) { return; }
  if (!pairs || !pairs.length) return;

  // Print scan table
  console.log('      ┌──────────────────────┬──────────────────┬────────┬──────────────────');
  console.log('      │ Label                │ name/id          │ type   │ → fill');
  console.log('      ├──────────────────────┼──────────────────┼────────┼──────────────────');
  for (const f of pairs) {
    const lbl  = (f.label||'').slice(0,20).padEnd(20);
    const nid  = (f.name||f.id||'').slice(0,16).padEnd(16);
    const typ  = (f.isSelect?'select':f.type).slice(0,6).padEnd(6);
    let fill   = '✗ no match';
    if (f.isHoneypot)  fill = '⚠ honeypot';
    else if (f.isCaptcha) fill = '⚠ captcha';
    else if (f.isSelect)  fill = 'select';
    else { const ft = matchField(f.ctx,f.tag,f.type); if (ft) fill = `→ [${ft}]`; }
    console.log(`      │ ${lbl} │ ${nid} │ ${typ} │ ${fill}`);
  }
  console.log('      └──────────────────────┴──────────────────┴────────┴──────────────────');

  for (const f of pairs) {
    if (!f.el || f.isHoneypot || f.isCaptcha) continue;
    // NEVER fill checkboxes with contact data — handled by checkCheckboxes()
    if (f.type === 'checkbox' || f.type === 'radio') continue;

    // Selects — smart selection
    if (f.isSelect) {
      const label = (f.label || f.name || '').toLowerCase();
      const opts  = f.options;

      // Remove placeholder options (Select..., --, Please choose, etc.)
      const real = opts.filter(o => {
        if (!o.value || o.value === '') return false;
        const t = o.text.trim().toLowerCase();
        // Exact placeholder patterns
        const placeholders = ['--','select','please select','choose','pick','none',
          'please choose','select one','select an option','- select -','--- select ---',
          'select a','choose a','choose an'];
        return !placeholders.some(p => t === p || t.startsWith(p + ' ') || t.startsWith(p + '-'));
      });

      // If no real options, take first non-empty value
      const pool = real.length ? real : opts.filter(o => o.value && o.value !== '');
      if (!pool.length) continue;

      let chosen = null;

      // 1. Phone/dial code → +1 United States
      if (/phone|mobile|country.?code|dial|calling/.test(label) ||
          pool.some(o => o.text.includes('+1') || o.text.includes('united states'))) {
        chosen = pool.find(o =>
          o.text.includes('+1') || o.text.includes('united states') ||
          o.text.includes('us (') || o.value === '+1' || o.value === '1' || o.value === 'us');
      }

      // 2. Country → India
      if (!chosen && /^country|country of|your country|nation/.test(label)) {
        chosen = pool.find(o =>
          o.text.includes('india') || o.value.toLowerCase() === 'in' ||
          o.value.toLowerCase() === 'india');
      }

      // 3. Inquiry/service/reason → prefer general/other/inquiry
      if (!chosen && !/phone|mobile|country|dial|calling/.test(label)) {
        const PREFER = [
          'general inquiry','general enquiry','general information',
          'general','other','inquiry','enquiry','information',
          'question','contact us','i\'d like to inquire','just inquiring',
        ];
        chosen = pool.find(o => PREFER.some(p => o.text === p || o.text.startsWith(p)));
      }

      // 4. Default → first real option (after Select...)
      if (!chosen) chosen = pool[0];

      try {
        await driver.executeScript(
          'arguments[0].value=arguments[1]; arguments[0].dispatchEvent(new Event("change",{bubbles:true}));',
          f.el, chosen.value);
        console.log(`      ✓ Select [${f.label||f.name}] → '${chosen.text}'`);
        filled.push(`select:${f.label||f.name||'select'}`);
      } catch (_) {}
      continue;
    }

    const fieldTag = matchField(f.ctx, f.tag, f.type);
    if (!fieldTag || usedFields.has(fieldTag)) continue;

    const values = {
      first_name: contact.first_name, last_name: contact.last_name,
      full_name:  contact.full_name,  email:     contact.email,
      phone:      getPhoneValue(contact, f.ctx, f.mask, f.pattern, f.maxlength),
      company:    contact.company,    website:   contact.website,
      job_title:  contact.job_title,  subject:   contact.subject,
      budget:     contact.budget,     address:   contact.address,
      message:    contact.message,
    };
    const value = values[fieldTag];
    if (!value) continue;

    try {
      await driver.executeScript(SET_VALUE_JS, f.el, value);
      const short = value.slice(0,40) + (value.length>40?'...':'');
      console.log(`      ✓ [${f.label||f.name}] (${f.name}/${f.type}) → [${fieldTag}] "${short}"`);
      filled.push(fieldTag);
      usedFields.add(fieldTag);
      // Small human-like pause between fields
      await sleep(Math.floor(Math.random() * 400 + 200));
    } catch (_) {}
  }

  for (const [tag] of FIELD_PATTERNS) {
    if (!usedFields.has(tag) && !failed.includes(tag)) failed.push(tag);
  }
}

async function checkCheckboxes(driver, form) {
  let n = 0;
  try {
    n = await driver.executeScript(`
      var n=0;
      Array.from(arguments[0].querySelectorAll("input[type='checkbox']")).forEach(function(cb){
        if(cb.offsetParent!==null && !cb.checked){ cb.click(); n++; }
      });
      return n;
    `, form);
  } catch (_) {}
  if (n) console.log(`      ✓ Checked ${n} checkboxes`);
}

// Stubs for API compat
async function fillDropdownFields(){}
async function fillNameFields(){}
async function fillEmailField(){}
async function fillPhoneFields(){}
async function fillCompanyFields(){}
async function fillMessageFields(){}

module.exports = {
  fillAllFields, checkCheckboxes,
  fillDropdownFields, fillNameFields, fillEmailField,
  fillPhoneFields, fillCompanyFields, fillMessageFields,
};
