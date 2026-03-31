// config.js
'use strict';

// ── Rotating contact identities ───────────────────────────────────────────────
const _CONTACTS = [
  { first_name: 'Farhan', last_name: 'Ansari',  email: 'farhan.ansari@perceptionsystem.in' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'rafiq@perceptionsystem.net' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'raf@perceptionsystem.net' },
  { first_name: 'Ubbad',  last_name: 'Mansuri', email: 'ubbad@f3clicks.in' },
  { first_name: 'Ubbad',  last_name: 'Mansuri', email: 'ubbad@f3clicks.net' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'rafiq@perceptionsystem.in' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'raf@perceptionsystem.in' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'rafiq@perceptionsystem.co.in' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'raf@perceptionsystem.co.in' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'raf@perceptionsystem.us' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'rafiq@perceptionsystem.us' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'rafiq@perceptionoutreach.com' },
  { first_name: 'Rafiq',  last_name: 'Ansari',  email: 'raf@perceptionoutreach.com' },
];

let _contactIndex = 0;

function getNextContact() {
  const base = _CONTACTS[_contactIndex % _CONTACTS.length];
  _contactIndex++;
  const full = `${base.first_name} ${base.last_name}`;
  return {
    first_name:         base.first_name,
    last_name:          base.last_name,
    full_name:          full,
    job_title:          'Business Development',
    email:              base.email,
    phone:              '+1 408 520 9495',
    phone_country_code: '+1',
    phone_local:        '4085209495',
    company:            'Perception System',
    website:            'https://www.perceptionsystem.com/',
    subject:            'White-Label Dev & AI Services for Your Agency Clients',
    budget:             'Flexible',
    address:            'Ahmedabad, Gujarat, India',
    message: `Hi Team,

I came across your agency and love the work you're doing for your clients!

I'm reaching out from Perception System — a technology partner trusted by agencies like yours to deliver white-label services that you can resell under your own brand:

• White-Label Web & Mobile App Development (CRM, ERP, SaaS, custom builds)
• AI-powered automation & chatbot solutions for your clients
• White-Label SEO, SMM & Pay-after-results Digital Marketing
• Dedicated dev teams you can plug into your existing projects

We work quietly in the background — your clients never know we exist. You get the credit, we do the heavy lifting.

Trusted by agencies serving Dubai Govt., Stanford University & 500+ global clients.

Would love to explore how we can help you scale without hiring overhead.

Warm regards,
${full}
Business Development | Perception System
https://www.perceptionsystem.com/`,
  };
}

// Default contact for backward compat
const contact = getNextContact();
_contactIndex = 0; // reset so main loop starts from index 0

const URL_FILE            = 'retry_urls.txt';
const OUTPUT_DIR          = 'form_results';
const CSV_PATH            = `${OUTPUT_DIR}/contact_results.csv`;
const PROGRESS_FILE       = `${OUTPUT_DIR}/progress.txt`;
const PAGE_LOAD_TIMEOUT   = 20000;
const CAPTCHA_WAIT_TIMEOUT= 90000;
const CAPTCHA_POLICY      = 'auto';
const TWOCAPTCHA_API_KEY  = process.env.TWOCAPTCHA_API_KEY || null;
const CAPSOLVER_API_KEY   = process.env.CAPSOLVER_API_KEY  || null;
const MAX_CAPTCHA_RETRIES = 2;

const CSV_FIELDS = [
  'url','status','details','load_status','load_time_s',
  'contact_page_status','form_status','fields_filled',
  'filled_fields','failed_fields',
  'validation_status','captcha_status','submit_status','success_status',
];

module.exports = {
  contact, getNextContact, URL_FILE, OUTPUT_DIR, CSV_PATH, PROGRESS_FILE,
  PAGE_LOAD_TIMEOUT, CAPTCHA_WAIT_TIMEOUT, CAPTCHA_POLICY,
  TWOCAPTCHA_API_KEY, CAPSOLVER_API_KEY, MAX_CAPTCHA_RETRIES, CSV_FIELDS,
};
