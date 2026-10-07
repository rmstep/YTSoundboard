// Builds and publishes a release to the public releases repo.
// Creates the GitHub release first so electron-builder's uploaders don't race to create it.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { owner, repo } = pkg.build.publish;
const tag = 'v' + pkg.version;
const GH = process.env.GH_EXE || 'C:\\Program Files\\GitHub CLI\\gh.exe';

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: /\.cmd$|^npm|^npx/.test(cmd), env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`\nFailed: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1); }
};
const out = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });

const token = process.env.GH_TOKEN || out(GH, ['auth', 'token']).stdout.trim();
if (!token) { console.error('Not logged in to GitHub. Run: gh auth login'); process.exit(1); }
const env = { GH_TOKEN: token };

run('node', ['scripts/fetch-tools.js']);
run('node', ['scripts/pack-streamdeck.js']);

if (spawnSync(GH, ['release', 'view', tag, '-R', `${owner}/${repo}`], { env: { ...process.env, ...env } }).status !== 0) {
  console.log(`Creating release ${tag}…`);
  run(GH, ['release', 'create', tag, '-R', `${owner}/${repo}`, '--title', tag, '--notes', `YTSoundboard ${pkg.version}`], env);
}

run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always'], env);
run('node', ['scripts/pack-extension.js']);
run(GH, ['release', 'upload', tag, 'dist/ytsoundboard-extension.zip', '-R', `${owner}/${repo}`, '--clobber'], env);
console.log(`\nPublished ${tag}: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
