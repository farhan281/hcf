// result_tracker.js
'use strict';

const fs   = require('fs');
const path = require('path');
const { CSV_FIELDS, CSV_PATH, PROGRESS_FILE, OUTPUT_DIR } = require('./config');

const SHEETS_URL = process.env.GOOGLE_SHEETS_URL || '';

function sendToSheets(record) {
  if (!SHEETS_URL) return;
  const row = CSV_FIELDS.map(f => record[f] || '');
  fetch(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cf', rows: [row] })
  }).catch(() => {});
}

function takeDebugScreenshot(driver, prefix) {
  try {
    const p = path.join(OUTPUT_DIR, `${prefix}_${Math.floor(Date.now()/1000)}.png`);
    driver.takeScreenshot().then(data => {
      fs.writeFileSync(p, data, 'base64');
      console.log(`   📸 Screenshot: ${p}`);
    }).catch(() => {});
    return p;
  } catch (_) { return ''; }
}

function _escapeCsv(val) {
  // Strip NUL bytes and non-printable chars, then CSV-escape
  const s = String(val == null ? '' : val)
    .replace(/\x00/g, '')          // remove NUL bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ''); // remove other control chars
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function saveResults(results) {
  const header = CSV_FIELDS.join(',');
  const rows   = results.map(r => CSV_FIELDS.map(f => _escapeCsv(r[f] || '')).join(','));
  fs.writeFileSync(CSV_PATH, [header, ...rows].join('\n'), 'utf8');
}

function saveProgress(idx) {
  fs.writeFileSync(PROGRESS_FILE, String(idx), 'utf8');
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const v = fs.readFileSync(PROGRESS_FILE, 'utf8').trim();
      if (/^\d+$/.test(v)) return parseInt(v, 10);
    }
  } catch (_) {}
  return 0;
}

function loadExistingResults() {
  const results = [];
  if (!fs.existsSync(CSV_PATH)) return results;
  try {
    const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n').filter(Boolean);
    if (lines.length < 2) return results;
    const headers = lines[0].split(',');
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',');
      const row  = Object.fromEntries(CSV_FIELDS.map(f => [f, '']));
      headers.forEach((h, idx) => { if (row.hasOwnProperty(h)) row[h] = vals[idx] || ''; });
      results.push(row);
    }
  } catch (_) {}
  return results;
}

function clearProgress() {
  try { if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE); } catch (_) {}
}

function removeOverlays(driver) {
  const sels = ['#CybotCookiebotDialog','.cookie','.cky-consent-bar',
    'div[class*="cookie"]',"button[aria-label*='Accept']"];
  for (const s of sels) {
    driver.executeScript(
      `document.querySelectorAll(arguments[0]).forEach(e => e.remove());`, s
    ).catch(() => {});
  }
}

module.exports = {
  takeDebugScreenshot, saveResults, saveProgress,
  loadProgress, loadExistingResults, clearProgress, removeOverlays,
};
