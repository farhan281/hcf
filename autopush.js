#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const DEBOUNCE_MS = 3000;

const IGNORE = new Set([
  '.git', 'node_modules', 'form_results', '.wdm',
  'autopush.js', 'package-lock.json',
]);

let timer = null;

function push() {
  try {
    const status = execSync('git status --porcelain', { cwd: DIR }).toString().trim();
    if (!status) return;
    console.log(`[autopush] Changes detected:\n${status}`);
    execSync('git add -A', { cwd: DIR });
    execSync(`git commit -m "auto: ${new Date().toISOString()}"`, { cwd: DIR });
    execSync('git push origin main', { cwd: DIR });
    console.log('[autopush] ✅ Pushed to GitHub');
  } catch (e) {
    console.error('[autopush] ❌', e.message.split('\n')[0]);
  }
}

function watch(dir) {
  fs.readdirSync(dir).forEach(name => {
    if (IGNORE.has(name)) return;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        watch(full);
      } else {
        fs.watch(full, () => {
          clearTimeout(timer);
          timer = setTimeout(push, DEBOUNCE_MS);
        });
      }
    } catch (_) {}
  });

  // Watch dir itself for new files
  fs.watch(dir, (event, filename) => {
    if (!filename || IGNORE.has(filename.split(path.sep)[0])) return;
    clearTimeout(timer);
    timer = setTimeout(push, DEBOUNCE_MS);
  });
}

console.log('[autopush] 👀 Watching for changes...');
watch(DIR);
