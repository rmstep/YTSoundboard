'use strict';
const $ = (s) => document.querySelector(s);

let state = { sounds: [], settings: {}, issues: {}, port: 0, tools: {} };
let audio = {};                 // live audio graph
const buffers = new Map();      // sound id -> AudioBuffer
const voices = new Map();       // sound id -> [{nodes}]
let building = Promise.resolve();
let lastDeviceKey = '';

// ---------- helpers ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}

// KeyboardEvent -> Electron accelerator string
const CODE_MAP = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[',
  BracketRight: ']', Backslash: '\\', Backquote: '`', NumpadAdd: 'numadd', NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec'
};
function accelFromEvent(e) {
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (/^Numpad\d$/.test(e.code)) key = 'num' + e.code.slice(6);
  else key = CODE_MAP[e.code] || null;
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  return [...mods, key].join('+');
}

function captureKey() {
  return new Promise(async (resolve) => {
    await window.api.suspendHotkeys(true);
    const modal = $('#modal'), view = $('#modal-keys');
    view.textContent = '…'; modal.hidden = false;
    const done = async (val) => {
      window.removeEventListener('keydown', onKey, true);
      modal.hidden = true;
      await window.api.suspendHotkeys(false);
      resolve(val);
    };
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') return done(null);
      if (e.key === 'Delete') return done('');
      const accel = accelFromEvent(e);
      if (!accel) return;
      view.textContent = accel;
      done(accel);
    };
    window.addEventListener('keydown', onKey, true);
  });
}

// ---------- audio engine ----------
async function setSink(ctx, id) {
  try { await ctx.setSinkId(id || ''); } catch (e) { toast('Could not select output device: ' + e.message); }
}

function rebuildAudio() {
  building = building.then(doRebuild).catch((e) => toast('Audio error: ' + e.message));
  return building;
}

async function doRebuild() {
  stopAll();
  for (const c of [audio.cable, audio.spk]) if (c) { try { await c.close(); } catch { /* ignore */ } }
  if (audio.micStream) audio.micStream.getTracks().forEach((t) => t.stop());
  audio = {};
  const s = state.settings;

  // Context 1: your speakers / headphones.
  audio.spk = new AudioContext({ latencyHint: 'interactive' });
  await setSink(audio.spk, s.speakerDeviceId);
  audio.spkSounds = audio.spk.createGain();
  audio.spkMonitor = audio.spk.createGain();
  audio.spkSounds.connect(audio.spk.destination);
  audio.spkMonitor.connect(audio.spk.destination);

  // Context 2: the virtual cable, i.e. the "microphone" other apps hear.
  if (s.cableDeviceId) {
    audio.cable = new AudioContext({ latencyHint: 'interactive' });
    await setSink(audio.cable, s.cableDeviceId);
    audio.cableMaster = audio.cable.createGain();
    audio.cableSounds = audio.cable.createGain();
    audio.micGain = audio.cable.createGain();
    audio.analyser = audio.cable.createAnalyser();
    audio.analyser.fftSize = 512;
    audio.cableSounds.connect(audio.cableMaster);
    audio.micGain.connect(audio.cableMaster);
    audio.cableMaster.connect(audio.analyser);
    audio.cableMaster.connect(audio.cable.destination);

    if (s.micEnabled) {
      try {
        audio.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: s.micDeviceId ? { exact: s.micDeviceId } : undefined,
            echoCancellation: false, noiseSuppression: false, autoGainControl: false
          }
        });
        audio.cable.createMediaStreamSource(audio.micStream).connect(audio.micGain);
        audio.spk.createMediaStreamSource(audio.micStream).connect(audio.spkMonitor);
      } catch (e) { toast('Microphone unavailable: ' + e.message); }
    }
  }

  applyGains();
  buffers.clear();
  await loadBuffers();
}

function applyGains() {
  const s = state.settings;
  if (!audio.spk) return;
  audio.spkSounds.gain.value = s.masterVolume * s.soundsToSpeakers;
  audio.spkMonitor.gain.value = s.monitorMic ? s.micGain : 0;
  if (audio.cable) {
    audio.cableSounds.gain.value = s.masterVolume * s.soundsToMic;
    audio.micGain.gain.value = s.micGain;
  }
}

async function loadBuffers() {
  if (!audio.spk) return;
  const ids = new Set(state.sounds.map((x) => x.id));
  for (const id of [...buffers.keys()]) if (!ids.has(id)) buffers.delete(id);
  for (const snd of state.sounds) {
    if (buffers.has(snd.id)) continue;
    try {
      const bytes = await window.api.readSound(snd.id);
      if (!bytes) continue;
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      buffers.set(snd.id, await audio.spk.decodeAudioData(ab));
    } catch (e) { toast(`Could not decode "${snd.name}"`); }
  }
}

function stopSound(id) {
  for (const v of voices.get(id) || []) for (const n of v.nodes) { try { n.stop(); } catch { /* already stopped */ } }
}
function stopAll() { for (const id of [...voices.keys()]) stopSound(id); }

function play(id) {
  const snd = state.sounds.find((x) => x.id === id);
  const buf = buffers.get(id);
  if (!snd || !buf || !audio.spk) return;
  const active = voices.get(id) || [];
  const mode = state.settings.retrigger;
  if (active.length && mode === 'stop') return stopSound(id);
  if (active.length && mode === 'restart') stopSound(id);

  const voice = { nodes: [] };
  let remaining = 0;
  const targets = [[audio.spk, audio.spkSounds], [audio.cable, audio.cableSounds]];
  for (const [ctx, bus] of targets) {
    if (!ctx) continue;
    if (ctx.state !== 'running') ctx.resume();
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = snd.volume ?? 1;
    src.connect(g).connect(bus);
    remaining++;
    src.onended = () => {
      if (--remaining > 0) return;
      const list = (voices.get(id) || []).filter((v) => v !== voice);
      if (list.length) voices.set(id, list); else voices.delete(id);
      renderPlaying();
    };
    voice.nodes.push(src);
  }
  voices.set(id, [...(voices.get(id) || []), voice]);
  voice.nodes.forEach((n) => n.start());
  renderPlaying();
}

function renderPlaying() {
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('playing', voices.has(c.dataset.id)));
}

function drawMeter() {
  const bar = $('#meter-bar');
  const data = new Uint8Array(256);
  (function tick() {
    let peak = 0;
    if (audio.analyser) {
      audio.analyser.getByteTimeDomainData(data);
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
    }
    bar.style.width = Math.min(100, peak * 140) + '%';
    requestAnimationFrame(tick);
  })();
}

// ---------- UI ----------
const thumbCache = new Map();   // sound id -> data URL
async function applyThumb(card, id) {
  if (!thumbCache.has(id)) thumbCache.set(id, await window.api.readThumb(id));
  const url = thumbCache.get(id);
  if (url) card.style.backgroundImage = `linear-gradient(rgba(20,22,28,.35), rgba(20,22,28,.6)), url("${url}")`;
}

function renderGrid() {
  const grid = $('#grid');
  grid.textContent = '';
  if (!state.sounds.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'No sounds yet. Use the Chrome extension on youtube.com to clip a moment, or click “+ Add file”.';
    grid.append(d);
    return;
  }
  for (const s of state.sounds) {
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.id = s.id;
    if (s.thumb) applyThumb(card, s.id);

    const name = document.createElement('input');
    name.className = 'name'; name.value = s.name; name.maxLength = 80;
    name.addEventListener('change', () => window.api.updateSound(s.id, { name: name.value }));

    const keyBtn = document.createElement('button');
    keyBtn.className = 'keybtn' + (s.key ? '' : ' unset');
    keyBtn.textContent = s.key || 'Assign key';
    keyBtn.addEventListener('click', async () => {
      const k = await captureKey();
      if (k !== null) window.api.updateSound(s.id, { key: k });
    });

    const play$ = document.createElement('button');
    play$.className = 'play'; play$.textContent = '▶'; play$.title = 'Play';
    play$.addEventListener('click', () => play(s.id));

    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕'; del.title = 'Delete';
    del.addEventListener('click', () => { if (confirm(`Delete "${s.name}"?`)) window.api.deleteSound(s.id); });

    const vol = document.createElement('input');
    vol.type = 'range'; vol.min = 0; vol.max = 2; vol.step = 0.01; vol.value = s.volume ?? 1; vol.title = 'Sound volume';
    vol.addEventListener('change', () => window.api.updateSound(s.id, { volume: Number(vol.value) }));

    const r1 = document.createElement('div'); r1.className = 'row'; r1.append(play$, keyBtn, del);
    const r2 = document.createElement('div'); r2.className = 'row'; r2.append(vol);
    card.append(name, r1, r2);
    if (state.issues[s.id]) {
      const i = document.createElement('div'); i.className = 'issue'; i.textContent = '⚠ ' + state.issues[s.id];
      card.append(i);
    }
    grid.append(card);
  }
  renderPlaying();
}

async function renderDevices() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const fill = (sel, kind, current, defaultLabel) => {
    sel.textContent = '';
    sel.append(new Option(defaultLabel, ''));
    for (const d of devs) if (d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications') {
      sel.append(new Option(d.label || kind, d.deviceId));
    }
    sel.value = [...sel.options].some((o) => o.value === current) ? current : '';
  };
  const s = state.settings;
  fill($('#sel-mic'), 'audioinput', s.micDeviceId, 'System default microphone');
  fill($('#sel-cable'), 'audiooutput', s.cableDeviceId, '— none (speakers only) —');
  fill($('#sel-speaker'), 'audiooutput', s.speakerDeviceId, 'System default output');
  return devs;
}

function renderSettings() {
  const s = state.settings;
  const set = (id, out, v) => { $(id).value = v; $(out).textContent = Math.round(v * 100) + '%'; };
  set('#r-master', '#o-master', s.masterVolume);
  set('#r-mic', '#o-mic', s.micGain);
  set('#r-s2m', '#o-s2m', s.soundsToMic);
  set('#r-s2s', '#o-s2s', s.soundsToSpeakers);
  $('#c-mic').checked = s.micEnabled;
  $('#c-monitor').checked = s.monitorMic;
  $('#sel-retrigger').value = s.retrigger;
  const sk = $('#btn-stopkey');
  sk.textContent = s.stopKey || 'Assign key';
  sk.classList.toggle('unset', !s.stopKey);

  const ext = $('#chip-ext');
  ext.textContent = 'Extension port'; ext.className = 'chip ok';
  const t = $('#chip-tools');
  const ok = state.tools.ytdlp && state.tools.ffmpeg;
  t.textContent = ok ? 'Clipper ready' : !state.tools.ffmpeg ? 'ffmpeg missing' : 'yt-dlp will install on first clip';
  t.className = 'chip ' + (ok ? 'ok' : 'warn');
  $('#btn-install').hidden = !!state.tools.ytdlp;

  const c = $('#chip-cable');
  c.textContent = s.cableDeviceId ? 'Virtual mic on' : 'Virtual mic off';
  c.className = 'chip ' + (s.cableDeviceId ? 'ok' : 'warn');
  $('#cable-hint').textContent = s.cableDeviceId ? '' :
    'Pick a virtual cable output (VB-Cable’s “CABLE Input”) to send sounds to apps like Discord. In those apps, choose “CABLE Output” as the microphone.';
}

async function onState(next) {
  const prev = state;
  state = next;
  renderGrid();
  renderSettings();
  const devs = await renderDevices();

  // Offer the installer when no virtual cable exists; auto-pick one when it does.
  const cable = devs.find((d) => d.kind === 'audiooutput' && /cable input/i.test(d.label));
  $('#btn-cable').hidden = !!cable;
  if (cable && !state.settings.cableDeviceId && !onState.autoPicked) {
    onState.autoPicked = true;
    return window.api.setSettings({ cableDeviceId: cable.deviceId });
  }

  const key = [state.settings.micDeviceId, state.settings.cableDeviceId, state.settings.speakerDeviceId, state.settings.micEnabled].join('|');
  if (key !== lastDeviceKey) { lastDeviceKey = key; await rebuildAudio(); }
  else { applyGains(); await loadBuffers(); }
  void prev;
}

function bindControls() {
  const slider = (id, key) => $(id).addEventListener('input', (e) => {
    state.settings[key] = Number(e.target.value);
    renderSettings(); applyGains();
  });
  const commit = (id, key) => $(id).addEventListener('change', (e) => window.api.setSettings({ [key]: Number(e.target.value) }));
  [['#r-master', 'masterVolume'], ['#r-mic', 'micGain'], ['#r-s2m', 'soundsToMic'], ['#r-s2s', 'soundsToSpeakers']]
    .forEach(([id, k]) => { slider(id, k); commit(id, k); });

  $('#sel-mic').addEventListener('change', (e) => window.api.setSettings({ micDeviceId: e.target.value }));
  $('#sel-cable').addEventListener('change', (e) => window.api.setSettings({ cableDeviceId: e.target.value }));
  $('#sel-speaker').addEventListener('change', (e) => window.api.setSettings({ speakerDeviceId: e.target.value }));
  $('#sel-retrigger').addEventListener('change', (e) => window.api.setSettings({ retrigger: e.target.value }));
  $('#c-mic').addEventListener('change', (e) => window.api.setSettings({ micEnabled: e.target.checked }));
  $('#c-monitor').addEventListener('change', (e) => window.api.setSettings({ monitorMic: e.target.checked }));
  $('#btn-stopkey').addEventListener('click', async () => {
    const k = await captureKey();
    if (k !== null) window.api.setSettings({ stopKey: k });
  });
  $('#btn-stop').addEventListener('click', stopAll);
  $('#btn-add').addEventListener('click', () => window.api.importSounds());
  $('#btn-install').addEventListener('click', () => { toast('Downloading yt-dlp…'); window.api.installTools(); });

  $('#btn-extension').addEventListener('click', () => window.api.setupExtension());
  $('#btn-streamdeck').addEventListener('click', () => window.api.installStreamDeck());
  $('#btn-cable').addEventListener('click', () => { toast('Preparing virtual mic installer…'); window.api.installCable(); });
  navigator.mediaDevices.addEventListener('devicechange', () => onState(state));
  window.api.onState(onState);
  window.api.onTrigger(play);
  window.api.onStopAll(stopAll);
  window.api.onToast(toast);
  window.api.onUpdateReady((version) => {
    const b = $('#btn-update');
    b.textContent = `Update ${version} ready: restart`; b.hidden = false;
  });
  $('#btn-update').addEventListener('click', () => window.api.installUpdate());
}

(async function init() {
  bindControls();
  drawMeter();
  try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); }
  catch { /* labels may be blank until mic permission is granted */ }
  await onState(await window.api.getState());
})();
