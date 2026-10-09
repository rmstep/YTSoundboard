// Converts a sound to an MP3 Discord's soundboard accepts, saved under a readable name.
// Discord takes MP3/Ogg only (not WAV), so the stored WAV can't be dropped in as-is. The full
// clip is exported at full length; Discord's own uploader lets the user trim it.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yt = require('./ytdlp');

const MP3_KBPS = 192;   // no size cap: Discord's uploader trims and re-encodes, so keep the full quality in

// A name that is safe as a Windows file name and still recognisable as the sound.
function sanitize(name) {
  const clean = String(name || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60);
  return clean || 'sound';
}

function run(exe, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(exe, args, { windowsHide: true });
    let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject);
    c.on('close', (code) => resolve({ code, err }));
  });
}

async function durationOf(ffmpeg, file) {
  const r = await run(ffmpeg, ['-hide_banner', '-i', file]);   // exits non-zero without an output; the info is on stderr
  const m = r.err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

async function exportForDiscord({ srcPath, name, outDir, suffix = '' }) {
  const ffmpeg = yt.findFfmpeg();
  if (!ffmpeg) throw new Error('ffmpeg was not found');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, sanitize(name) + (suffix ? ` (${suffix})` : '') + '.mp3');
  const seconds = await durationOf(ffmpeg, srcPath);
  const r = await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', srcPath, '-vn',
    '-ac', '2', '-ar', '48000', '-codec:a', 'libmp3lame', '-b:a', MP3_KBPS + 'k', out]);
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(r.err.trim().split('\n').pop() || 'ffmpeg failed');
  return { file: out, seconds, kb: Math.round(fs.statSync(out).size / 1024) };
}

module.exports = { exportForDiscord, sanitize };
