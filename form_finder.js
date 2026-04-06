'use strict';

const { By } = require('selenium-webdriver');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const SKIP_IFRAME_SRC = [
  'google-analytics','googletagmanager','facebook.com/plugins',
  'twitter.com/widgets','youtube.com','maps.google','recaptcha',
  'captcha','doubleclick','ads.',
];

async function clearOverlays(driver) {
  try {
    await driver.executeScript(`
      ['[class*="cookie"]','[class*="gdpr"]','[class*="consent"]','[class*="popup"]',
       '[id*="cookie"]','[id*="popup"]','#CybotCookiebotDialog','#onetrust-banner-sdk',
       '.cc-window','.pum-overlay'].forEach(function(s){
        document.querySelectorAll(s).forEach(function(el){
          var st=window.getComputedStyle(el);
          if(st.position==='fixed'||st.position==='absolute') el.style.display='none';
        });
      });
      document.body.style.overflow='auto';
    `);
  } catch (_) {}
}

// Returns scored form data — elements returned separately via findElements
async function findContactForm(driver) {
  console.log('   🔍 Searching for contact form...');
  await clearOverlays(driver);

  for (let pass = 1; pass <= 3; pass++) {
    if (pass > 1) {
      console.log(`      ⏳ Pass ${pass}/3 — waiting for JS render...`);
      await sleep(pass * 800);  // reduced from 1200
      try {
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight*0.3)');
        await sleep(300);
        await driver.executeScript('window.scrollTo(0,0)');
      } catch (_) {}
    }

    // Get forms + scores — inline JS (not template string) to avoid escaping issues
    let formData = [];
    let allForms = [];
    try {
      allForms = await driver.findElements(By.tagName('form'));
      if (allForms.length > 0) {
        formData = await driver.executeScript(function() {
          var PLUGINS = ['wpcf7','wpforms','gform','gravityform','ninja-form','formidable',
                         'elementor-form','hs-form','hubspot','contact-form','cf7'];
          var url = window.location.href.toLowerCase();
          var onContact = ['contact','inquiry','enquiry','feedback','reach','touch']
            .some(function(w){ return url.indexOf(w) !== -1; });
          return Array.from(document.querySelectorAll('form') || []).map(function(f, i) {
            var inputs = Array.from(f.querySelectorAll('input,textarea,select'));
            var visible = inputs.filter(function(e) {
              return e.offsetParent !== null && e.type !== 'hidden' &&
                     e.type !== 'submit' && e.type !== 'button' && e.type !== 'image';
            });
            var html = (f.outerHTML || '').toLowerCase().substring(0, 5000);
            var hasEmail    = !!f.querySelector('input[type=email],[name*=email i],[id*=email i],[placeholder*=email i]');
            var hasTextarea = !!f.querySelector('textarea');
            var hasSubmit   = !!f.querySelector('button[type=submit],input[type=submit],button:not([type])');
            var hasPassword = !!f.querySelector('input[type=password]');
            var isSearch    = (f.id||'').toLowerCase().indexOf('search') !== -1 ||
                              (f.className||'').toLowerCase().indexOf('search') !== -1;
            var isPlugin    = PLUGINS.some(function(p){ return html.indexOf(p) !== -1; });
            var score = 0;
            if (hasEmail)    score += 30;
            if (hasTextarea) score += 25;
            if (hasSubmit)   score += 15;
            if (visible.length >= 3) score += 10;
            else if (visible.length >= 2) score += 5;
            if (isPlugin)    score += 20;
            if (onContact)   score += 15;
            if (hasPassword) score -= 50;
            if (isSearch)    score -= 40;
            if (visible.length <= 1 && !hasEmail && !hasTextarea) score -= 20;
            return { idx: i, score: score, visible: visible.length,
                     hasEmail: hasEmail, hasTextarea: hasTextarea,
                     hasSubmit: hasSubmit, hasPassword: hasPassword, isSearch: isSearch };
          });
        }) || [];
      }
    } catch (_) {}

    if (formData.length > 0 && allForms.length > 0) {
      // Sort by score
      formData.sort((a, b) => b.score - a.score);

      console.log(`      Found ${allForms.length} form(s):`);
      formData.forEach(f => {
        console.log(`        Form ${f.idx+1}: score=${f.score} email=${f.hasEmail} textarea=${f.hasTextarea} visible=${f.visible} pw=${f.hasPassword}`);
      });

      // Pick best valid form
      for (const f of formData) {
        if (f.hasPassword || f.isSearch) continue;
        if (f.hasEmail || f.hasTextarea || f.visible >= 2) {
          const form = allForms[f.idx];
          if (form) {
            console.log(`      ✅ Selected form ${f.idx+1} (score=${f.score})`);
            return form;
          }
        }
      }
    }

    // Check iframes
    try {
      const iframes = await driver.findElements(By.tagName('iframe'));
      for (const iframe of iframes) {
        const src = (await iframe.getAttribute('src').catch(() => '') || '').toLowerCase();
        if (SKIP_IFRAME_SRC.some(s => src.includes(s))) continue;
        if (!(await iframe.isDisplayed().catch(() => false))) continue;
        try {
          await driver.switchTo().frame(iframe);
          const iData = await driver.executeScript(function() {
            var PLUGINS = ['wpcf7','wpforms','gform','gravityform','ninja-form','formidable','elementor-form','hs-form','hubspot','contact-form','cf7'];
            return Array.from(document.querySelectorAll('form')||[]).map(function(f,i){
              var inputs = Array.from(f.querySelectorAll('input,textarea,select'));
              var visible = inputs.filter(function(e){ return e.offsetParent!==null&&e.type!=='hidden'&&e.type!=='submit'&&e.type!=='button'; });
              var html = (f.outerHTML||'').toLowerCase().substring(0,3000);
              var hasEmail = !!f.querySelector('input[type=email],[name*=email i]');
              var hasTextarea = !!f.querySelector('textarea');
              var hasPassword = !!f.querySelector('input[type=password]');
              var isPlugin = PLUGINS.some(function(p){ return html.indexOf(p)!==-1; });
              var score = (hasEmail?30:0)+(hasTextarea?25:0)+(visible.length>=2?10:0)+(isPlugin?20:0)-(hasPassword?50:0);
              return {idx:i,score:score,visible:visible.length,hasEmail:hasEmail,hasTextarea:hasTextarea,hasPassword:hasPassword};
            });
          }).catch(() => []) || [];
          const iForms = await driver.findElements(By.tagName('form')).catch(() => []);
          if (iData.length && iForms.length) {
            iData.sort((a, b) => b.score - a.score);
            for (const f of iData) {
              if (f.hasPassword || f.isSearch) continue;
              if (f.hasEmail || f.hasTextarea || f.visible >= 2) {
                const form = iForms[f.idx];
                if (form) {
                  console.log(`      ✅ Found form in iframe (score=${f.score})`);
                  return form;
                }
              }
            }
          }
          await driver.switchTo().defaultContent();
        } catch (_) {
          await driver.switchTo().defaultContent().catch(() => {});
        }
      }
    } catch (_) {}

    // Formless (React/Vue/Angular)
    try {
      const formless = await driver.executeScript(`
        var inputs = Array.from(document.querySelectorAll(
          'input:not([type=hidden]):not([type=submit]):not([type=button])' +
          ':not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password]),textarea'
        )).filter(function(el){ return el.offsetParent!==null && !el.closest('form'); });
        if (inputs.length < 2) return null;
        var hasEmail = inputs.some(function(el){
          return el.type==='email'||
                 (el.name+' '+el.id+' '+(el.placeholder||'')).toLowerCase().indexOf('email')!==-1;
        });
        var hasMsg = inputs.some(function(el){ return el.tagName.toLowerCase()==='textarea'; });
        if (!hasEmail && !hasMsg) return null;
        function anc(el){var a=[];while(el){a.push(el);el=el.parentElement;}return a;}
        var sets=inputs.map(anc);
        var common=sets[0].find(function(a){return sets.every(function(s){return s.indexOf(a)!==-1;});});
        return common||document.body;
      `);
      if (formless) {
        console.log('      ✅ Found formless contact section');
        return formless;
      }
    } catch (_) {}
  }

  console.log('      ❌ No contact form found');
  return null;
}

module.exports = { findContactForm };
