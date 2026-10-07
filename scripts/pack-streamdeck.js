// Builds build-tools/YTSoundboard.streamDeckPlugin (a zip of the .sdPlugin folder) for the installer.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const parent = path.join(root, 'streamdeck-plugin');
const folder = 'com.rmstep.ytsoundboard.sdPlugin';
const out = path.join(root, 'build-tools');
fs.mkdirSync(out, { recursive: true });

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
};

// The plugin runs inside Stream Deck's Node runtime, so it carries its own dependencies.
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], path.join(parent, folder));

const zip = path.join(out, 'YTSoundboard.zip');
const plugin = path.join(out, 'YTSoundboard.streamDeckPlugin');
for (const f of [zip, plugin]) if (fs.existsSync(f)) fs.unlinkSync(f);
run('tar', ['-a', '-c', '-f', zip, '-C', parent, folder], root);   // bsdtar writes a standard zip
fs.renameSync(zip, plugin);
console.log('Wrote', plugin);
