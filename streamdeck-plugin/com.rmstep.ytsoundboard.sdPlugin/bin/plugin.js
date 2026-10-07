// YTSoundboard Stream Deck plugin. Talks to the desktop app on 127.0.0.1:38917.
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:38917';
const HEADERS = { 'X-YTSoundboard': '1' };
const PLAY = 'com.rmstep.ytsoundboard.play';

const argv = process.argv.slice(2);
const arg = (name) => argv[argv.indexOf(name) + 1];
const port = arg('-port');
const pluginUUID = arg('-pluginUUID');
const registerEvent = arg('-registerEvent');

const contexts = new Map();   // context -> { action, soundId }
const shown = new Map();      // context -> last rendered "name|thumb" so we only redraw on change
const thumbCache = new Map(); // sound id -> data URL (or null)
let sounds = [];
let ws;

const send = (msg) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

async function call(path, options = {}) {
  const res = await fetch(BASE + path, { ...options, headers: { ...HEADERS, ...(options.headers || {}) } });
  return res;
}

async function refreshSounds() {
  try {
    const res = await call('/sounds');
    if (res.ok) sounds = (await res.json()).sounds;
  } catch { /* app not running: keep the last list */ }
  return sounds;
}

async function thumbFor(sound) {
  if (!sound.thumb) return null;
  if (thumbCache.has(sound.id)) return thumbCache.get(sound.id);
  try {
    const res = await call('/thumb/' + encodeURIComponent(sound.id));
    const url = res.ok ? 'data:image/png;base64,' + Buffer.from(await res.arrayBuffer()).toString('base64') : null;
    thumbCache.set(sound.id, url);
    return url;
  } catch { return null; }
}

async function render(context) {
  const c = contexts.get(context);
  if (!c || c.action !== PLAY) return;
  const sound = sounds.find((s) => s.id === c.soundId);
  const sig = sound ? `${sound.name}|${sound.thumb}` : 'none';
  if (shown.get(context) === sig) return;
  shown.set(context, sig);
  if (!sound) {
    send({ event: 'setTitle', context, payload: { title: c.soundId ? 'Missing' : '', target: 0 } });
    send({ event: 'setImage', context, payload: { target: 0 } });   // back to the default image
    return;
  }
  send({ event: 'setTitle', context, payload: { title: sound.name, target: 0 } });
  const image = await thumbFor(sound);
  send({ event: 'setImage', context, payload: image ? { image, target: 0 } : { target: 0 } });
}

async function renderAll() {
  await refreshSounds();
  for (const context of contexts.keys()) await render(context);
}

async function onKeyDown(context) {
  const c = contexts.get(context);
  if (!c) return;
  try {
    if (c.action === PLAY) {
      if (!c.soundId) return send({ event: 'showAlert', context });
      const res = await call('/play', { method: 'POST', body: JSON.stringify({ id: c.soundId }) });
      if (!res.ok) send({ event: 'showAlert', context });
    } else {
      await call('/stop', { method: 'POST', body: '{}' });
    }
  } catch {
    send({ event: 'showAlert', context });   // app isn't running
  }
}

function connect() {
  ws = new WebSocket('ws://127.0.0.1:' + port);
  ws.on('open', () => send({ event: registerEvent, uuid: pluginUUID }));
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    switch (msg.event) {
      case 'willAppear':
        contexts.set(msg.context, { action: msg.action, soundId: (msg.payload.settings || {}).soundId || '' });
        shown.delete(msg.context);
        await refreshSounds();
        render(msg.context);
        break;
      case 'willDisappear':
        contexts.delete(msg.context);
        shown.delete(msg.context);
        break;
      case 'didReceiveSettings': {
        const c = contexts.get(msg.context);
        if (c) { c.soundId = (msg.payload.settings || {}).soundId || ''; shown.delete(msg.context); render(msg.context); }
        break;
      }
      case 'keyDown':
        onKeyDown(msg.context);
        break;
      case 'sendToPlugin':   // the property inspector asking for the sound list
        if ((msg.payload || {}).request === 'sounds') {
          await refreshSounds();
          send({ event: 'sendToPropertyInspector', action: msg.action, context: msg.context, payload: { sounds } });
        }
        break;
      default:
    }
  });
  ws.on('close', () => process.exit(0));
}

if (port && pluginUUID && registerEvent) {
  connect();
  setInterval(renderAll, 3000);   // pick up renamed, added or deleted sounds
}
