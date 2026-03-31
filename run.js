'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CSV_PATH  = '/home/ubuntu/Downloads/map/salesforce_unified_data.csv';
const URLS_FILE = path.join(__dirname, 'retry_urls.txt');

function parseCsvLine(line) {
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
const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
const contactFormIdx = headers.findIndex(h => h.includes('contact form'));
const actualWebIdx   = headers.findIndex(h => h.includes('actual website'));
const mapsWebIdx     = headers.findIndex(h => h.includes('maps website'));

const seen = new Set();
const urls = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const url = (contactFormIdx >= 0 && cols[contactFormIdx]) ? cols[contactFormIdx]
            : (actualWebIdx   >= 0 && cols[actualWebIdx])   ? cols[actualWebIdx]
            : (mapsWebIdx     >= 0 && cols[mapsWebIdx])     ? cols[mapsWebIdx]
            : '';
  if (url && /^https?:\/\//i.test(url) && !url.includes('google.com/maps') && !seen.has(url)) {
    seen.add(url);
    urls.push(url);
  }
}

console.log(`📂 CSV: ${CSV_PATH}`);
console.log(`🔗 Extracted ${urls.length} unique URLs`);
fs.writeFileSync(URLS_FILE, urls.join('\n') + '\n', 'utf8');
console.log(`✅ Saved to ${URLS_FILE}\n🚀 Starting...\n`);

const child = spawn('node', ['main.js'], { cwd: __dirname, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
