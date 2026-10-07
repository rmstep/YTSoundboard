const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

// We never ship VB-Audio's files; the user's machine downloads them from VB-Audio directly.
const PAGE = 'https://vb-audio.com/Cable/';
const FALLBACK = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';
const ALLOWED_HOST = 'download.vb-audio.com';

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AutoSoundboard' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('Too many redirects'));
        return resolve(get(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      resolve(res);
    }).on('error', reject);
  });
}

async function latestPackUrl() {
  try {
    const res = await get(PAGE);
    let html = '';
    for await (const c of res) html += c;
    const urls = [...html.matchAll(/https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack(\d+)\.zip/g)];
    if (urls.length) return urls.sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  } catch { /* use fallback */ }
  return FALLBACK;
}

function ps(script) {
  return new Promise((resolve, reject) => {
    const c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || 'PowerShell failed'))));
  });
}

// Downloads, verifies the signature, then launches the installer (Windows shows its UAC prompt).
async function install(onStatus = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbcable-'));
  const zip = path.join(dir, 'pack.zip');

  onStatus('Downloading VB-Cable…');
  const url = await latestPackUrl();
  if (new URL(url).hostname !== ALLOWED_HOST) throw new Error('Unexpected download host');
  const res = await get(url);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zip);
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });

  onStatus('Verifying installer…');
  const extract = path.join(dir, 'x');
  await ps(`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${extract}' -Force`);
  const exe = path.join(extract, 'VBCABLE_Setup_x64.exe');
  const sig = await ps(`$s = Get-AuthenticodeSignature -LiteralPath '${exe}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`);
  const [status, subject] = sig.split('|');
  if (status !== 'Valid' || !/VB-?Audio|Burel/i.test(subject || '')) {
    throw new Error(`Installer signature check failed (${status})`);
  }

  onStatus('Approve the Windows prompt, then click “Install Driver”.');
  await ps(`Start-Process -FilePath '${exe}' -Verb RunAs`);
}

module.exports = { install };
