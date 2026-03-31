'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CSV_PATH  = path.join(__dirname, 'salesforce_unified_data.csv');
const URLS_FILE = path.join(__dirname, 'retry_urls.txt');

function runProcess(cmd, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Starting: ${label}`);
    console.log('='.repeat(60) + '\n');
    const child = spawn(cmd, args, { cwd: __dirname, stdio: 'inherit' });
    child.on('exit', code => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function extractUrls() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log('⚠️  CSV not found yet — skipping URL extraction');
    return 0;
  }

  function parseLine(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    fields.push(cur.trim());
    return fields.map(f => f.replace(/^"|"$/g, '').trim());
  }

  const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n').filter(Boolean);
  if (lines.length < 2) return 0;

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const cfIdx  = headers.findIndex(h => h.includes('contact form'));
  const awIdx  = headers.findIndex(h => h.includes('actual website'));
  const mwIdx  = headers.findIndex(h => h.includes('maps website'));

  const seen = new Set();
  const urls = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const url = (cfIdx >= 0 && cols[cfIdx])  ? cols[cfIdx]
              : (awIdx >= 0 && cols[awIdx])   ? cols[awIdx]
              : (mwIdx >= 0 && cols[mwIdx])   ? cols[mwIdx]
              : '';
    if (url && /^https?:\/\//i.test(url) && !url.includes('google.com/maps') && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  fs.writeFileSync(URLS_FILE, urls.join('\n') + '\n', 'utf8');
  return urls.length;
}

(async () => {
  // Step 1: Run Google Maps scraper
  await runProcess('node', ['unified_scraper.js'], 'Google Maps Scraper');

  // Step 2: Extract URLs from CSV
  console.log('\n📂 Extracting URLs from CSV...');
  const count = extractUrls();
  console.log(`🔗 Extracted ${count} unique URLs → ${URLS_FILE}`);

  if (count === 0) {
    console.log('❌ No URLs found. Exiting.');
    process.exit(1);
  }

  // Step 3: Run contact form filler
  await runProcess('node', ['main.js'], 'Contact Form Filler');

  console.log('\n✅ All done!');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
