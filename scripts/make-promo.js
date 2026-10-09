// Renders the Chrome Web Store promo tiles. Run with: npx electron scripts/make-promo.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

const root = path.join(__dirname, '..');
const badge = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', 'icon.png')).toString('base64');

const base = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Segoe UI", sans-serif; color: #fff; overflow: hidden;
         background: radial-gradient(circle at 20% 30%, #3a0f12 0%, #14161c 55%); }
  .tag { color: #b8bdcc; }
`;

const cards = [
  ['Airhorn', 'F13', 'linear-gradient(135deg,#7b2ff7,#f107a3)'],
  ['Sad trombone', 'F14', 'linear-gradient(135deg,#0f9b8e,#1e3c72)'],
  ['Drum roll', 'F15', 'linear-gradient(135deg,#f7971e,#e5484d)'],
  ['Applause', 'F16', 'linear-gradient(135deg,#2193b0,#6dd5ed)']
];
const card = ([name, key, bg]) => `
  <div class="card" style="background:${bg}">
    <div class="shade"></div>
    <div class="name">${name}</div>
    <div class="row"><div class="play">▶</div><div class="key">${key}</div></div>
  </div>`;

const small = `<style>${base}
  body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  img { width: 96px; height: 96px; margin-bottom: 14px; }
  h1 { font-size: 38px; font-weight: 700; letter-spacing: -.5px; }
  p { font-size: 16px; margin-top: 8px; padding: 0 30px; line-height: 1.35; }
</style>
<img src="${badge}"><h1>YTSoundboard</h1><p class="tag">Clip YouTube moments into hotkey sounds</p>`;

const marquee = `<style>${base}
  body { width: 1400px; height: 560px; display: flex; align-items: center; padding: 0 90px; gap: 70px; }
  .left { flex: 1; }
  .left img { width: 150px; height: 150px; }
  h1 { font-size: 84px; font-weight: 700; letter-spacing: -2px; margin-top: 18px; }
  .left p { font-size: 30px; margin-top: 14px; line-height: 1.3; }
  .pill { display: inline-block; margin-top: 26px; padding: 10px 20px; border-radius: 30px; background: #ffffff18; font-size: 20px; }
  .grid { display: grid; grid-template-columns: 250px 250px; gap: 22px; transform: rotate(-3deg); }
  .card { position: relative; width: 250px; height: 175px; border-radius: 14px; padding: 14px; overflow: hidden;
          display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px #0008; }
  .shade { position: absolute; inset: 0; background: linear-gradient(#14161c30, #14161c90); }
  .name { position: relative; background: #fff; color: #000; font-weight: 700; font-size: 20px; padding: 6px 12px; border-radius: 6px; }
  .row { position: relative; display: flex; align-items: center; gap: 12px; }
  .play { width: 46px; height: 46px; border-radius: 50%; background: #ff0000; display: grid; place-items: center; font-size: 18px; }
  .key { font: 600 18px Consolas, monospace; background: #14161ccc; padding: 6px 14px; border-radius: 6px; }
</style>
<div class="left"><img src="${badge}"><h1>YTSoundboard</h1>
  <p class="tag">Clip any moment from YouTube and play it into your mic with a hotkey.</p>
  <div class="pill">Free Windows app · Discord · OBS · Stream Deck</div></div>
<div class="grid">${cards.map(card).join('')}</div>`;

let win;
async function render(html, w, h, file) {
  if (!win) win = new BrowserWindow({ show: false, width: w, height: h, useContentSize: true, frame: false });
  win.setContentSize(w, h);
  const tmp = path.join(require('os').tmpdir(), `promo-${w}x${h}.html`);
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">' + html);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 400));
  let img = await win.capturePage();
  const size = img.getSize();
  if (size.width !== w || size.height !== h) img = img.resize({ width: w, height: h, quality: 'best' });
  fs.writeFileSync(file, img.toJPEG(95));   // JPEG: no alpha channel, as the store requires
}

// Link-preview image (Open Graph / GitHub social preview): the marquee layout at 1200x630.
const og = marquee.replace('</style>', `
  body { width: 1200px; height: 630px; padding: 0 70px; gap: 40px; }
  .left img { width: 120px; height: 120px; } h1 { font-size: 70px; } .left p { font-size: 26px; }
  .pill { font-size: 17px; } .grid { grid-template-columns: 230px 230px; gap: 18px; } .card { width: 230px; height: 160px; }
</style>`);

app.whenReady().then(async () => {
  const out = path.join(root, 'store-assets');
  fs.mkdirSync(out, { recursive: true });
  await render(small, 440, 280, path.join(out, 'promo-small-440x280.jpg'));
  await render(marquee, 1400, 560, path.join(out, 'promo-marquee-1400x560.jpg'));
  await render(og, 1200, 630, path.join(out, 'social-preview-1200x630.jpg'));
  app.quit();
});
