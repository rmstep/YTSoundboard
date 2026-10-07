// Zips the extension for upload to the Chrome Web Store (manifest.json must be at the zip root).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'extension');
const dest = path.join(__dirname, '..', 'dist', 'ytsoundboard-extension.zip');
fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) fs.unlinkSync(dest);
const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${src}\\*' -DestinationPath '${dest}' -Force`], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);
console.log('Wrote', dest);
