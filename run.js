'use strict';

const { spawn } = require('child_process');

console.log('\n🗺️  Starting Google Maps Scraper...\n');
const child = spawn('node', ['unified_scraper.js'], { cwd: __dirname, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
