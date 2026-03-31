'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CSV_PATH      = path.join(__dirname, 'digital_marketing_data.csv');
const URLS_FILE     = path.join(__dirname, 'retry_urls.txt');
const FILLER_DONE   = path.join(__dirname, 'form_results', 'progress.txt');

fs.mkdirSync(path.join(__dirname, 'form_results'), { recursive: true });

// ── Already filled URLs from results CSV ────────────────────────────────────
function getFilledUrls() {
  const resultsCsv = path.join(__dirname, 'form_results', 'contact_results.csv');
  if (!fs.existsSync(resultsCsv)) return new Set();
  const filled = new Set();
  const lines = fs.readFileSync(resultsCsv, 'utf8').split('\n').filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const url = lines[i].split(',')[0].replace(/^"|"$/g, '').trim();
    if (url) filled.add(url);
  }
  return filled;
}

// ── Parse CSV and extract new URLs not yet in retry_urls.txt ─────────────────
function extractNewUrls() {
  if (!fs.existsSync(CSV_PATH)) return [];

  function parseLine(line) {
    const fields = []; let cur = '', inQ = false;
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
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const cfIdx = headers.findIndex(h => h.includes('contact form'));
  const awIdx = headers.findIndex(h => h.includes('actual website'));
  const mwIdx = headers.findIndex(h => h.includes('maps website'));

  // Already queued URLs
  const already = new Set([
    ...(fs.existsSync(URLS_FILE)
      ? fs.readFileSync(URLS_FILE, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
      : []),
    ...getFilledUrls(),
  ]);

  const newUrls = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const url = (cfIdx >= 0 && cols[cfIdx])  ? cols[cfIdx]
              : (awIdx >= 0 && cols[awIdx])   ? cols[awIdx]
              : (mwIdx >= 0 && cols[mwIdx])   ? cols[mwIdx]
              : '';
    if (url && /^https?:\/\//i.test(url) && !url.includes('google.com/maps') && !already.has(url)) {
      already.add(url);
      newUrls.push(url);
    }
  }
  return newUrls;
}

// ── Append new URLs to retry_urls.txt ────────────────────────────────────────
function appendUrls(urls) {
  if (!urls.length) return;
  fs.appendFileSync(URLS_FILE, urls.join('\n') + '\n', 'utf8');
  console.log(`   ➕ Added ${urls.length} new URLs to queue`);
}

// ── Start a process ───────────────────────────────────────────────────────────
function startProcess(cmd, args, label) {
  console.log(`\n${'='.repeat(55)}\n🚀 ${label}\n${'='.repeat(55)}\n`);
  const child = spawn(cmd, args, { cwd: __dirname, stdio: 'inherit' });
  return child;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // Clear old urls file so we start fresh
  if (fs.existsSync(URLS_FILE)) fs.unlinkSync(URLS_FILE);

  // Start scraper
  const scraper = startProcess('node', ['unified_scraper.js'], 'Google Maps Scraper');

  // Start form filler
  const filler = startProcess('node', ['main.js'], 'Contact Form Filler');

  // Watch CSV — every 60s check for new URLs and append to queue
  const watcher = setInterval(() => {
    const newUrls = extractNewUrls();
    if (newUrls.length) appendUrls(newUrls);
  }, 60000);

  // Wait for both to finish
  await Promise.allSettled([
    new Promise(r => scraper.on('exit', r)),
    new Promise(r => filler.on('exit', r)),
  ]);

  clearInterval(watcher);

  // Final sync — pick up any remaining URLs scraper added
  const remaining = extractNewUrls();
  if (remaining.length) {
    appendUrls(remaining);
    console.log(`\n🔄 ${remaining.length} URLs remaining — running filler one more time...`);
    await new Promise(r => {
      const f = spawn('node', ['main.js'], { cwd: __dirname, stdio: 'inherit' });
      f.on('exit', r);
    });
  }

  console.log('\n✅ All done!');
})();
