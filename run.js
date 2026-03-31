#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const CSV_DIR    = '/home/ubuntu/Downloads/map';
const URLS_FILE  = path.join(__dirname, 'retry_urls.txt');

// ── Parse CSV properly (handles quoted fields with commas) ────────────────────
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
  return fields;
}

// ── Extract URLs from CSV ─────────────────────────────────────────────────────
function extractUrls(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.replace(/"/g,'').trim().toLowerCase());
  const contactFormIdx = headers.findIndex(h => h.includes('contact form'));
  const actualWebIdx   = headers.findIndex(h => h.includes('actual website'));
  const mapsWebIdx     = headers.findIndex(h => h.includes('maps website'));

  const urls = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]).map(c => c.replace(/^"|"$/g,'').trim());
    // Prefer: Contact Form URL > Actual Website > Maps Website
    const url = (contactFormIdx >= 0 && cols[contactFormIdx]) ? cols[contactFormIdx]
              : (actualWebIdx   >= 0 && cols[actualWebIdx])   ? cols[actualWebIdx]
              : (mapsWebIdx     >= 0 && cols[mapsWebIdx])     ? cols[mapsWebIdx]
              : '';
    if (url && /^https?:\/\//i.test(url) && !url.includes('google.com/maps')) {
      urls.add(url);
    }
  }
  return [...urls];
}

// ── Find latest CSV in MAP folder ─────────────────────────────────────────────
function findLatestCsv(dir) {
  if (!fs.existsSync(dir)) { console.error(`❌ Folder not found: ${dir}`); process.exit(1); }
  const csvs = fs.readdirSync(dir)
    .filter(f => f.endsWith('.csv'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!csvs.length) { console.error(`❌ No CSV found in ${dir}`); process.exit(1); }
  return path.join(dir, csvs[0].f);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const csvPath = findLatestCsv(CSV_DIR);
console.log(`📂 CSV: ${csvPath}`);

const urls = extractUrls(csvPath);
console.log(`🔗 Extracted ${urls.length} URLs`);

if (!urls.length) { console.error('❌ No URLs found in CSV'); process.exit(1); }

fs.writeFileSync(URLS_FILE, urls.join('\n') + '\n', 'utf8');
console.log(`✅ Saved to ${URLS_FILE}`);
console.log(`\n🚀 Starting contact form filler...\n`);

// Run main.js
const child = spawn('node', ['main.js'], {
  cwd: __dirname,
  stdio: 'inherit',
});
child.on('exit', code => process.exit(code || 0));
