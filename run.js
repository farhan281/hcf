'use strict';

const { spawn } = require('child_process');

// Start autopush in background
const autopush = spawn('node', ['autopush.js'], { cwd: __dirname, stdio: 'ignore', detached: true });
autopush.unref();
console.log('🔄 Autopush started\n');

// Start Real Estate scraper
console.log('🏠 Starting Real Estate Google Maps Scraper...\n');
const scraper = spawn('node', ['unified_scraper.js'], { cwd: __dirname, stdio: 'inherit' });

// Start form filler in parallel (watches CSV for new URLs)
console.log('📋 Starting Contact Form Filler (watching for URLs)...\n');
const filler = spawn('node', ['fill.js'], { cwd: __dirname, stdio: 'inherit', detached: true });
filler.unref();

scraper.on('exit', code => {
  console.log('\n✅ Scraper done. Filler continues in background.');
  process.exit(code || 0);
});
