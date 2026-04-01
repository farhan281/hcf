'use strict';

const { spawn } = require('child_process');

// Start autopush in background
const autopush = spawn('node', ['autopush.js'], { cwd: __dirname, stdio: 'ignore', detached: true });
autopush.unref();
console.log('🔄 Autopush started\n');

// Start scraper
console.log('🗺️  Starting Google Maps Scraper...\n');
const child = spawn('node', ['unified_scraper.js'], { cwd: __dirname, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
