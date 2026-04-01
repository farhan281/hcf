const fs   = require('fs');
const path = require('path');
const UNKNOWN_LOG = path.join(__dirname, 'form_results', 'unknown_fields.log');

function logUnknown(url, label, name, id, placeholder, type) {
  const line = `${new Date().toISOString()} | ${url} | label="${label}" name="${name}" id="${id}" ph="${placeholder}" type=${type}\n`;
  try { fs.appendFileSync(UNKNOWN_LOG, line); } catch(_) {}
}

// ── Set value — works with React, Vue, Angular, plain HTML ────────────────────
const SET_VALUE_JS = `
(function(el, val) {
  el.scrollIntoView({block:'nearest'});
  el.focus();
  var tag   = el.tagName;
  var proto = tag==='TEXTAREA' ? window.HTMLTextAreaElement.prototype
            : tag==='SELECT'   ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
  var setter = Object.getOwnPropertyDescriptor(proto, 'value');
  if (setter && setter.set) setter.set.call(el, val);
  else el.value = val;
  ['input','change','blur','keyup'].forEach(function(t){
    el.dispatchEvent(new Event(t, {bubbles:true, cancelable:true}));
  });
})(arguments[0], arguments[1]);
`;

// ── Captcha inputs — never fill ───────────────────────────────────────────────
const CAPTCHA_PATTERNS = [
  'captcha','securimage','verify_code','verification_code','security_code',
  'antispam','anti_spam','bot_check','human_check','spam_check',
  'enter the code','enter code','type the code','type code','math',
  'enter the correct','correct answer','spam protection','anti spam',
  'what is','calculate','solve this',
  'wpcf7-quiz','quiz-',
];

// ── Field definitions — order matters (most specific first) ───────────────────
// Each entry: [fieldKey, [...keywords]]
const FIELD_DEFS = [
  ['first_name', [
    'first name','firstname','first-name','fname','given name','given-name',
    'forename','your first name','first_name','prénom','nombre',
  ]],
  ['last_name', [
    'last name','lastname','last-name','lname','surname','family name',
    'family-name','your last name','last_name','nom','apellido',
  ]],
  ['full_name', [
    'full name','fullname','full-name','your name','your full name',
    'contact name','contactname','name *','your name *','full_name',
    'complete name','legal name',
  ]],
  ['email', [
    'email','e-mail','email address','e-mail address','your email',
    'work email','business email','company email','email *','correo',
    'emailaddress','email_address','mail address','your e-mail',
    'email id','e mail','courriel',
  ]],
  ['phone', [
    'phone','phone number','phone no','phone_number','phonenumber',
    'mobile','mobile number','mobile no','cell','cell phone','cellphone',
    'telephone','tel','contact number','contact no','whatsapp',
    'mob','ph','ph no','phno','your number','your phone','contact_no',
    'phone *','mobile *','téléphone','telefono',
  ]],
  ['company', [
    'company','company name','companyname','company_name',
    'organization','organisation','business','business name',
    'firm','agency','agency name','brand','brand name',
    'practice','clinic','hospital','school','institute','employer',
    'your company','your organization','entreprise','empresa',
  ]],
  ['website', [
    'website','web site','website url','your website','company website',
    'url','site','homepage','web address','webaddress','site url',
    'your url','your site','web','site web',
  ]],
  ['job_title', [
    'job title','jobtitle','job_title','job role','position','role',
    'designation','occupation','title','your title','your role',
    'specialty','speciality','profession','your position','job function',
    'what do you do','your job','work title',
  ]],
  ['subject', [
    'subject','subject line','email subject','message subject',
    'topic','regarding','re:','inquiry subject','enquiry subject',
    'purpose','reason','service','interested in','interest',
    'how can we help','how can i help you','what can we help',
    'type of inquiry','type of enquiry','inquiry type','service type',
    'project type','what are you looking for','nature of inquiry',
    'i am interested in','looking for','need help with',
    'what brings you here','department',
  ]],
  ['message', [
    'message','your message','write your message','enter message',
    'comment','comments','description','project description',
    'details','project details','tell us','tell us more',
    'notes','additional','additional info','additional information',
    'body','content','requirements','project requirements',
    'inquiry','enquiry','concern','request','info','information',
    'question','questions','write to us','brief','project brief',
    'about your project','about project','your inquiry','your enquiry',
    'leave a message','send a message','write us','drop us',
    'anything else','other information','more details',
  ]],
  ['budget', [
    'budget','project budget','your budget','estimated budget',
    'price range','investment','spend','how much','approximate budget',
    'budget range','monthly budget','annual budget',
  ]],
  ['address', [
    'address','street address','your address','mailing address',
    'city','state','country','zip','postal','postal code',
    'region','province','location','street','town',
  ]],
];

function matchField(ctx, tag, type) {
  if (tag === 'textarea') return 'message';
  if (type === 'email')   return 'email';
  if (type === 'tel')     return 'phone';
  if (type === 'url')     return 'website';
  if (type === 'number') {
    if (ctx.match(/phone|mobile|cell|tel|mob/)) return 'phone';
    return null;
  }

  // Email — before company ('company email' → email)
  if (ctx.match(/\bemail\b/) || ctx.includes('e-mail') || ctx.includes('e mail') ||
      ctx.includes('courriel') || ctx.includes('correo')) return 'email';

  // Company — before name ('company name' → company)
  if (ctx.match(/\bcompany\b/) || ctx.match(/\borganiz/) ||
      ctx.match(/\bbusiness\b/) || ctx.match(/\bfirm\b/) ||
      ctx.match(/\bagency\b/)   || ctx.match(/\bemployer\b/) ||
      ctx.match(/\binstitut/)   || ctx.includes('brand name') ||
      ctx.includes('empresa')   || ctx.includes('entreprise')) return 'company';

  // Phone
  if (ctx.match(/\bphone\b/)    || ctx.match(/\bmobile\b/) ||
      ctx.match(/\btel\b/)      || ctx.match(/\bcell\b/) ||
      ctx.match(/\bwhatsapp\b/) || ctx.match(/\bmob\b/) ||
      ctx.includes('contact number') || ctx.includes('phone no') ||
      ctx.includes('mobile no') || ctx.includes('ph no') ||
      ctx.includes('telephone') || ctx.includes('téléphone') ||
      ctx.includes('telefono')  || ctx.includes('phonenumber')) return 'phone';

  // First name — 'First' alone OR 'first name'
  if (ctx.match(/\bfirst\b/)    || ctx.includes('fname') ||
      ctx.includes('firstname') || ctx.includes('first_name') ||
      ctx.includes('given name')|| ctx.includes('forename') ||
      ctx.includes('given-name')|| ctx.includes('prénom') ||
      ctx.includes('nombre'))     return 'first_name';

  // Last name — 'Last' alone OR 'last name'
  if (ctx.match(/\blast\b/)     || ctx.includes('lname') ||
      ctx.includes('lastname')  || ctx.includes('last_name') ||
      ctx.includes('surname')   || ctx.includes('family name') ||
      ctx.includes('family-name')|| ctx.includes('apellido')) return 'last_name';

  // Full name
  if (ctx.includes('full name') || ctx.includes('fullname') ||
      ctx.includes('your name') || ctx.includes('contact name') ||
      ctx.includes('complete name') || ctx.includes('legal name') ||
      ctx.match(/^name[\s\*]*$/) || ctx.match(/\bname\s*\*?\s*$/)) return 'full_name';
  // Generic 'name' — not company/brand/domain
  if (ctx.match(/\bname\b/) &&
      !ctx.match(/company|brand|agency|business|domain|file|user|login|product|page/)) return 'full_name';

  // Website
  if (ctx.match(/\bwebsite\b/) || ctx.match(/\burl\b/) ||
      ctx.includes('web address') || ctx.includes('homepage') ||
      ctx.includes('site web')   || ctx.includes('your site')) return 'website';

  // Job title
  if (ctx.includes('job title') || ctx.includes('jobtitle') ||
      ctx.match(/\bdesignation\b/) || ctx.match(/\boccupation\b/) ||
      ctx.includes('your role')   || ctx.includes('your position') ||
      ctx.includes('work title')  || ctx.includes('job function') ||
      (ctx.match(/\bposition\b/) && !ctx.match(/apply|hiring|open/)) ||
      (ctx.match(/\brole\b/)     && !ctx.match(/apply|hiring/))) return 'job_title';

  // Subject / inquiry type
  if (ctx.match(/\bsubject\b/)  || ctx.match(/\btopic\b/) ||
      ctx.match(/\bregarding\b/)|| ctx.includes('interested in') ||
      ctx.includes('service type') || ctx.includes('inquiry type') ||
      ctx.includes('enquiry type') || ctx.includes('type of inquiry') ||
      ctx.includes('type of enquiry') || ctx.includes('nature of') ||
      ctx.includes('how can we help') || ctx.includes('what can we') ||
      ctx.includes('looking for') || ctx.includes('need help with') ||
      ctx.includes('i am interested') || ctx.includes('department') ||
      ctx.includes('what brings you')) return 'subject';

  // Budget
  if (ctx.match(/\bbudget\b/)   || ctx.includes('price range') ||
      ctx.match(/\binvestment\b/) || ctx.includes('how much') ||
      ctx.includes('monthly budget') || ctx.includes('annual budget')) return 'budget';

  // Address
  if (ctx.match(/\baddress\b/)  || ctx.match(/\bcity\b/) ||
      ctx.match(/\bstate\b/)    || ctx.match(/\bzip\b/) ||
      ctx.match(/\bpostal\b/)   || ctx.match(/\bprovince\b/) ||
      ctx.match(/\bregion\b/)   || ctx.match(/\btown\b/)) return 'address';

  // Message — broad, last resort
  if (ctx.match(/\bmessage\b/)      || ctx.match(/\bcomment\b/) ||
      ctx.match(/\bdescription\b/)  || ctx.match(/\bdetails\b/) ||
      ctx.match(/\bnotes\b/)        || ctx.match(/\brequirements\b/) ||
      ctx.match(/\binquiry\b/)      || ctx.match(/\benquiry\b/) ||
      ctx.match(/\bconcern\b/)      || ctx.match(/\brequest\b/) ||
      ctx.includes('tell us')       || ctx.includes('write to') ||
      ctx.includes('about your project') || ctx.includes('project brief') ||
      ctx.includes('anything else') || ctx.includes('more details') ||
      ctx.includes('leave a message') || ctx.includes('drop us')) return 'message';

  // Keyword scan fallback
  for (const [fieldKey, keywords] of FIELD_DEFS) {
    if (keywords.some(k => ctx.includes(k))) return fieldKey;
  }

  return null;
}
// ── Phone value formatter ─────────────────────────────────────────────────────
function getPhoneValue(contact, ctx, mask, pattern, maxlength) {
  mask      = (mask      || '').toLowerCase();
  pattern   = (pattern   || '').toLowerCase();
  maxlength = parseInt(maxlength) || 0;

  // Masked input formats
  if (mask.includes('(999)') || mask.includes('(000)'))
    return contact.phone_local.slice(0,5) + ' ' + contact.phone_local.slice(5);
  if (mask.includes('999-999') || mask.includes('000-000'))
    return contact.phone_local.slice(0,5) + '-' + contact.phone_local.slice(5);

  // maxlength hints
  if (maxlength === 10) return contact.phone_local;
  if (maxlength === 12) return '+91' + contact.phone_local;
  if (maxlength === 13) return '+91 ' + contact.phone_local;
  if (maxlength > 0 && maxlength < 10) return contact.phone_local.slice(0, maxlength);

  // Pattern hints
  if (pattern.includes('\\d{10}')) return contact.phone_local;
  if (pattern.includes('\\d{12}')) return '91' + contact.phone_local;

  // Context hints
  if (ctx.includes('with country') || ctx.includes('country code') ||
      ctx.includes('+91') || ctx.includes('international')) return contact.phone;

  return contact.phone_local;
}

// ── Get label from DOM element ────────────────────────────────────────────────
const GET_LABEL_FN = `
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
  // 5. previous sibling text/label
  var prev = el.previousElementSibling;
  if (prev && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes(prev.tagName) && prev.innerText)
    return prev.innerText.trim();
  // 6. parent div/span text nodes
  var par = el.parentElement;
  if (par && par.tagName !== 'FORM') {
    var txt = Array.from(par.childNodes)
      .filter(function(n){ return n.nodeType===3; })
      .map(function(n){ return n.textContent.trim(); })
      .filter(Boolean).join(' ');
    if (txt) return txt;
    // check grandparent for label
    var gpar = par.parentElement;
    if (gpar && gpar.tagName !== 'FORM') {
      var glbl = gpar.querySelector('label,span,p,div');
      if (glbl && glbl !== par && glbl.innerText) return glbl.innerText.trim();
    }
  }
  // 7. fieldset legend
  var fs = el.closest('fieldset');
  if (fs) { var lg = fs.querySelector('legend'); if (lg) return lg.innerText.trim(); }
  // 8. data attributes
  var dl = el.getAttribute('data-label') || el.getAttribute('data-placeholder') ||
           el.getAttribute('data-name')  || el.getAttribute('data-field');
  if (dl) return dl.trim();
  // 9. placeholder / name / id (last resort)
  return el.placeholder || el.name || el.id || '';
}
`;

// ── Scan form fields ──────────────────────────────────────────────────────────
async function fillAllFields(driver, form, contact, usedFields, filled, failed) {
  let pairs;
  try {
    pairs = await driver.executeScript(function(form, captchaPatterns) {
      // inline getLabel
      function getLabel(el) {
        if (el.id) { var l=document.querySelector('label[for="'+el.id+'"]'); if(l) return l.innerText.trim(); }
        var aria=el.getAttribute('aria-label'); if(aria) return aria.trim();
        var lby=el.getAttribute('aria-labelledby');
        if(lby){ var parts=lby.split(/\s+/).map(function(id){ var lb=document.getElementById(id); return lb?lb.innerText.trim():''; }).filter(Boolean); if(parts.length) return parts.join(' '); }
        var wrap=el.closest('label'); if(wrap) return wrap.innerText.replace(el.value||'','').trim();
        var prev=el.previousElementSibling;
        if(prev&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(prev.tagName)&&prev.innerText) return prev.innerText.trim();
        var par=el.parentElement;
        if(par&&par.tagName!=='FORM'){
          var txt=Array.from(par.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.textContent.trim();}).filter(Boolean).join(' ');
          if(txt) return txt;
          var gpar=par.parentElement;
          if(gpar&&gpar.tagName!=='FORM'){var glbl=gpar.querySelector('label,span,p');if(glbl&&glbl!==par&&glbl.innerText)return glbl.innerText.trim();}
        }
        var fs=el.closest('fieldset'); if(fs){var lg=fs.querySelector('legend');if(lg)return lg.innerText.trim();}
        var dl=el.getAttribute('data-label')||el.getAttribute('data-placeholder')||el.getAttribute('data-name')||el.getAttribute('data-field');
        if(dl) return dl.trim();
        return el.placeholder||el.name||el.id||'';
      }
      var inputs=Array.from(form.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]):not([type=file]),textarea,select'
      )).filter(function(el){return el.offsetParent!==null || el.closest('[class*=hidden_container]') || el.closest('[class*=frm_hidden]');});
      return inputs.map(function(el){
        var label=getLabel(el);
        var ctx=(label+' '+el.name+' '+el.id+' '+(el.placeholder||'')+' '+
                 (el.getAttribute('autocomplete')||'')+' '+(el.getAttribute('data-label')||'')+' '+
                 (el.getAttribute('data-name')||'')+' '+(el.getAttribute('data-field')||'')).toLowerCase();
        var tag=el.tagName.toLowerCase();
        var type=(el.type||'text').toLowerCase();
        var style=window.getComputedStyle(el);
        var isHoneypot=style.display==='none'||style.visibility==='hidden'||
                       style.opacity==='0'||el.tabIndex===-1||
                       (el.offsetWidth===0&&el.offsetHeight===0);
        var isCaptcha=captchaPatterns.some(function(p){return ctx.indexOf(p)!==-1;});
        var opts=tag==='select'?Array.from(el.options).map(function(o){return{value:o.value,text:o.text.trim().toLowerCase()};}):[]; 
        return{
          el:el,ctx:ctx,label:label,tag:tag,type:type,
          name:el.name||'',id:el.id||'',placeholder:el.placeholder||'',
          isHoneypot:isHoneypot,isCaptcha:isCaptcha,isSelect:tag==='select',options:opts,
          mask:el.getAttribute('data-inputmask')||el.getAttribute('data-mask')||el.getAttribute('data-inputmask-mask')||'',
          pattern:el.getAttribute('pattern')||'',
          maxlength:el.getAttribute('maxlength')||''
        };
      });
    }, form, CAPTCHA_PATTERNS);
  } catch (_) { return; }
  if (!pairs || !pairs.length) return;

  // Print scan table
  console.log('      ┌──────────────────────┬──────────────────┬────────┬──────────────────');
  console.log('      │ Label                │ name/id          │ type   │ → fill');
  console.log('      ├──────────────────────┼──────────────────┼────────┼──────────────────');
  for (const f of pairs) {
    const lbl = (f.label||'').slice(0,20).padEnd(20);
    const nid = (f.name||f.id||'').slice(0,16).padEnd(16);
    const typ = (f.isSelect?'select':f.type).slice(0,6).padEnd(6);
    let fill  = '✗ no match';
    if (f.isHoneypot)    fill = '⚠ honeypot';
    else if (f.isCaptcha) fill = '⚠ captcha';
    else if (f.isSelect)  fill = 'select';
    else { const ft = matchField(f.ctx, f.tag, f.type); if (ft) fill = `→ [${ft}]`; }
    console.log(`      │ ${lbl} │ ${nid} │ ${typ} │ ${fill}`);
  }
  console.log('      └──────────────────────┴──────────────────┴────────┴──────────────────');

  for (const f of pairs) {
    if (!f.el || f.isHoneypot || f.isCaptcha) continue;
    if (f.type === 'checkbox' || f.type === 'radio') continue;

    // ── Selects ──────────────────────────────────────────────────────────────
    if (f.isSelect) {
      const label = (f.label || f.name || f.id || '').toLowerCase();
      const opts  = f.options;

      const real = opts.filter(o => {
        if (!o.value || o.value === '') return false;
        const t = o.text.trim().toLowerCase();
        const placeholders = ['--','---','select','please select','choose','pick','none',
          'please choose','select one','select an option','- select -','--- select ---',
          'select a','choose a','choose an','n/a','other'];
        return !placeholders.some(p => t === p || t.startsWith(p+' ') || t.startsWith(p+'-'));
      });
      const pool = real.length ? real : opts.filter(o => o.value && o.value !== '');
      if (!pool.length) continue;

      let chosen = null;

      // Phone/dial code → India +91
      if (/phone|mobile|country.?code|dial|calling|flag/.test(label) ||
          pool.some(o => o.text.includes('+91') || o.text.includes('india'))) {
        chosen = pool.find(o =>
          o.text.includes('+91') || o.text.includes('india') ||
          o.value === '+91' || o.value === '91' || o.value.toLowerCase() === 'in');
      }

      // Country → India
      if (!chosen && /country|nation|location/.test(label)) {
        chosen = pool.find(o =>
          o.text.includes('india') || o.value.toLowerCase() === 'in' ||
          o.value === '91' || o.value.toLowerCase() === 'india');
      }

      // Service/inquiry type → digital marketing related
      if (!chosen && /service|interest|topic|subject|inquiry|enquiry|type|reason|department|help|looking/.test(label)) {
        const PREFER = [
          'digital marketing','seo','social media','marketing','advertising',
          'ppc','content marketing','branding','web design','web development',
          'general inquiry','general enquiry','general information','general',
          'other','inquiry','enquiry','information','question','contact us',
        ];
        chosen = pool.find(o => PREFER.some(p => o.text === p || o.text.includes(p)));
        // fallback: first real option
        if (!chosen) chosen = pool[0];
      }

      // Budget → flexible/custom
      if (!chosen && /budget|price|cost|investment/.test(label)) {
        chosen = pool.find(o =>
          o.text.includes('flexible') || o.text.includes('custom') ||
          o.text.includes('discuss') || o.text.includes('other'));
      }

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

    // ── Text inputs ───────────────────────────────────────────────────────────
    const fieldKey = matchField(f.ctx, f.tag, f.type);
    if (!fieldKey) {
      // Log unknown field for future improvement
      try {
        const url = await driver.getCurrentUrl().catch(() => '');
        logUnknown(url, f.label, f.name, f.id, f.placeholder, f.type);
      } catch(_) {}
      continue;
    }
    if (usedFields.has(fieldKey)) continue;

    const values = {
      first_name: contact.first_name,
      last_name:  contact.last_name,
      full_name:  contact.full_name,
      email:      contact.email,
      phone:      getPhoneValue(contact, f.ctx, f.mask, f.pattern, f.maxlength),
      company:    contact.company,
      website:    contact.website,
      job_title:  contact.job_title,
      subject:    contact.subject,
      budget:     contact.budget,
      address:    contact.address,
      message:    contact.message,
    };
    const value = values[fieldKey];
    if (!value) continue;

    try {
      await driver.executeScript(SET_VALUE_JS, f.el, value);
      const short = value.slice(0,40) + (value.length>40?'...':'');
      console.log(`      ✓ [${f.label||f.name||f.id}] → [${fieldKey}] "${short}"`);
      filled.push(fieldKey);
      usedFields.add(fieldKey);
      await sleep(Math.floor(Math.random() * 300 + 150));
    } catch (_) {}
  }

  // Track failed fields
  for (const [key] of FIELD_DEFS) {
    if (!usedFields.has(key) && !failed.includes(key)) failed.push(key);
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
