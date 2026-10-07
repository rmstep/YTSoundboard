// Collects the helper binaries that the installer bundles into resources/bin.
// yt-dlp is public domain (Unlicense). ffmpeg-static ships a GPLv3 ffmpeg build: see THIRD-PARTY.txt.
const fs = require('fs');
const path = require('path');
const https = require('https');

const out = path.join(__dirname, '..', 'build-tools');
fs.mkdirSync(out, { recursive: true });

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'YTSoundboard-build' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('Too many redirects'));
        return resolve(download(new URL(res.headers.location, url).href, dest, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const ytdlp = path.join(out, 'yt-dlp.exe');
  if (!fs.existsSync(ytdlp)) {
    console.log('Downloading yt-dlp…');
    await download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ytdlp);
  }
  fs.copyFileSync(require('ffmpeg-static'), path.join(out, 'ffmpeg.exe'));
  fs.writeFileSync(path.join(out, 'THIRD-PARTY.txt'),
`Bundled tools
- yt-dlp (Unlicense / public domain): https://github.com/yt-dlp/yt-dlp
- FFmpeg (GPLv3 build via the ffmpeg-static npm package): https://ffmpeg.org  source: https://github.com/eugeneware/ffmpeg-static
VB-Cable is NOT bundled; it is downloaded from vb-audio.com on request and is the property of VB-Audio Software.
`);
  console.log('Tools ready in build-tools/');
})().catch((e) => { console.error(e); process.exit(1); });
