'use strict';
const { makeDriver } = require('./driver_setup');
const { fillAllFields, checkCheckboxes } = require('./fields');
const { findContactForm } = require('./form_finder');
const { findContactPage } = require('./navigator');
const { handleCaptcha } = require('./captcha/handler');
const { submitForm, detectSuccess } = require('./submitter');
const { getNextContact } = require('./config');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const driver = await makeDriver();
  const contact = getNextContact();
  console.log('👤', contact.full_name, contact.email);
  try {
    // Load with timeout handling
    try {
      await driver.get('https://artgro.com');
    } catch(e) {
      if (e.message.includes('renderer')) {
        console.log('⚠️ Renderer timeout — stopping and continuing...');
        try { await driver.executeScript('window.stop();'); } catch(_) {}
        await sleep(2000);
      } else throw e;
    }
    await sleep(4000);
    await findContactPage(driver);
    const form = await findContactForm(driver);
    if (!form) { console.log('No form found'); return; }
    console.log('✅ Form found');
    const usedFields = new Set();
    const filled = [], failed = [];
    await fillAllFields(driver, form, contact, usedFields, filled, failed);
    console.log('Filled:', filled.join(', '));
    await checkCheckboxes(driver, form);
    await sleep(1000);
    const record = { captcha_status:'', details:'', submit_status:'', success_status:'' };
    const cap = await handleCaptcha(driver, record, 'pre-submit', form, 120000);
    console.log('Captcha:', cap, record.captcha_status);
    if (cap === 'clear') {
      await sleep(1500);
      const [s] = await submitForm(driver, form, record);
      console.log('Submitted:', s);
      await sleep(4000);
      console.log(await detectSuccess(driver) ? '✅ SUCCESS!' : '❌ No confirmation');
    }
  } catch(e) {
    console.log('❌ Error:', e.message.slice(0, 150));
  } finally {
    await sleep(5000);
    await driver.quit();
  }
})();
