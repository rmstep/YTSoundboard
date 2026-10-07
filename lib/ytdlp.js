const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const MAX_CLIP_SECONDS = 120;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

let binDir = '';

// Installed builds carry yt-dlp and ffmpeg in resources/bin.
const bundledDir = path.join(process.resourcesPath || '', 'bin');

function init(dir) {
  binDir = dir;
  fs.mkdirSync(binDir, { recursive: true });
  // Copy yt-dlp to a writable folder so it can self-update when YouTube changes.
  const bundled = path.join(bundledDir, 'yt-dlp.exe');
  if (!fs.existsSync(localPath()) && fs.existsSync(bundled)) fs.copyFileSync(bundled, localPath());
}

function localPath() {
  return path.join(binDir, 'yt-dlp.exe');
}

function findOnPath(exe) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findYtDlp() {
  if (fs.existsSync(localPath())) return localPath();
  const winget = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe');
  return findOnPath('yt-dlp.exe') || (fs.existsSync(winget) ? winget : null);
}

function findFfmpeg() {
  const bundled = path.join(bundledDir, 'ffmpeg.exe');
  if (fs.existsSync(bundled)) return bundled;
  return findOnPath('ffmpeg.exe') || (fs.existsSync('C:\\ffmpeg\\bin\\ffmpeg.exe') ? 'C:\\ffmpeg\\bin\\ffmpeg.exe' : null);
}

function status() {
  return { ytdlp: !!findYtDlp(), ffmpeg: !!findFfmpeg() };
}

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'YTSoundboard' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('Too many redirects'));
        return resolve(download(new URL(res.headers.location, url).href, dest, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('Download failed: HTTP ' + res.statusCode));
      }
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on('error', reject);
    }).on('error', reject);
  });
}

async function install() {
  await download(YTDLP_URL, localPath());
}

function run(exe, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

// Accept only plain YouTube video URLs and rebuild a canonical one, so nothing
// else from the request ever reaches the yt-dlp command line.
function canonicalUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'https:' || !YT_HOSTS.has(u.hostname)) throw new Error('Only YouTube URLs are supported');
  let id = null;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else { const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/); if (m) id = m[1]; }
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Could not find a video id in the URL');
  return 'https://www.youtube.com/watch?v=' + id;
}

function validateRange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error('Invalid start/end');
  if (end - start > MAX_CLIP_SECONDS) throw new Error(`Clips are limited to ${MAX_CLIP_SECONDS} seconds`);
}

async function downloadClip({ url, start, end, outDir, id }) {
  const video = canonicalUrl(url);
  validateRange(start, end);
  let exe = findYtDlp();
  if (!exe) { await install(); exe = findYtDlp(); }

  const args = [
    '-f', 'bestaudio/best',
    '--no-playlist', '--no-progress',
    '--download-sections', `*${start.toFixed(2)}-${end.toFixed(2)}`,
    '--force-keyframes-at-cuts',
    '-x', '--audio-format', 'wav',
    '--postprocessor-args', 'ffmpeg:-ac 2 -ar 48000',
    '-o', path.join(outDir, id + '.%(ext)s')
  ];
  const ff = findFfmpeg();
  if (ff) args.push('--ffmpeg-location', path.dirname(ff));
  args.push(video);

  let res = await run(exe, args);
  if (res.code !== 0 && exe === localPath()) {
    // YouTube changes often; yt-dlp releases fix it. Update once and retry.
    await run(exe, ['-U']);
    res = await run(exe, args);
  }
  const file = path.join(outDir, id + '.wav');
  if (res.code !== 0 || !fs.existsSync(file)) {
    const msg = (res.err.trim().split('\n').filter(Boolean).pop() || 'yt-dlp failed');
    throw new Error(msg);
  }
  return id + '.wav';
}

// Saves the video's thumbnail next to the sound; falls back to a smaller size if maxres is missing.
async function downloadThumbnail({ url, outDir, id }) {
  const videoId = new URL(canonicalUrl(url)).searchParams.get('v');
  const file = id + '.jpg';
  for (const size of ['maxresdefault', 'hqdefault']) {
    try {
      await download(`https://i.ytimg.com/vi/${videoId}/${size}.jpg`, path.join(outDir, file));
      return file;
    } catch { /* try the next size */ }
  }
  throw new Error('No thumbnail available');
}

module.exports = { init, status, install, downloadClip, downloadThumbnail, canonicalUrl, MAX_CLIP_SECONDS };
