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
  // Restart the card's sweep: the ring should complete one lap by the time this sound ends.
  playStarts.set(id, { t0: performance.now(), dur: buf.duration });
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) { card.classList.remove('playing'); void card.offsetWidth; }
  renderPlaying();
}

const playStarts = new Map();   // sound id -> { t0: when the latest play began (ms), dur: sound length (s) }

function renderPlaying() {
  document.querySelectorAll('.card').forEach((c) => {
    const id = c.dataset.id, on = voices.has(id);
    if (on && !c.classList.contains('playing')) {
      // A negative delay resumes the sweep mid-lap if the card was rebuilt while the sound played.
      const p = playStarts.get(id);
      if (p) {
        c.style.setProperty('--dur', p.dur + 's');
        c.style.setProperty('--delay', -((performance.now() - p.t0) / 1000) + 's');
      }
    }
    c.classList.toggle('playing', on);
  });
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
// iOS-style share glyph: a box open at the top with an arrow leaving it.
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/>' +
  '<path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

// Only sounds clipped from YouTube keep the recipe (video, start, end) a share link needs.
const isShareable = (s) => !!(s && s.source && s.source.url);

let shareFor = null;   // sound id the open share menu belongs to
function closeShareMenu() { $('#share-menu').hidden = true; shareFor = null; }
function toggleShareMenu(anchor, id) {
  const menu = $('#share-menu');
  if (!menu.hidden && shareFor === id) return closeShareMenu();
  shareFor = id;
  const canLink = isShareable(state.sounds.find((x) => x.id === id));
  $('#menu-share-one').hidden = !canLink;
  $('#menu-share-multi').hidden = !canLink;
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 6 + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)) + 'px';
}

// ---------- multi-select sharing ----------
let selecting = null;   // Set of picked sound ids while choosing sounds to share, otherwise null

function updateSelectionUi() {
  if (selecting) for (const id of [...selecting]) if (!isShareable(state.sounds.find((s) => s.id === id))) selecting.delete(id);
  $('#grid').classList.toggle('selecting', !!selecting);
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('picked', !!selecting && selecting.has(c.dataset.id)));
  $('#select-bar').hidden = !selecting;
  if (!selecting) return;
  const n = selecting.size, total = state.sounds.filter(isShareable).length;
  $('#select-count').textContent = n ? `${n} selected` : 'Select sounds to share';
  $('#select-share').disabled = n === 0;
  $('#select-all').textContent = n > 0 && n === total ? 'Select none' : 'Select all';
}
function enterSelection(firstId) { closeShareMenu(); selecting = new Set(firstId ? [firstId] : []); updateSelectionUi(); }
function exitSelection() { selecting = null; updateSelectionUi(); }
function togglePick(id) {
  if (!selecting || !isShareable(state.sounds.find((s) => s.id === id))) return;
  if (!selecting.delete(id)) selecting.add(id);
  updateSelectionUi();
}

async function copyShareLinks(ids) {
  const r = await window.api.shareLinks(ids);
  if (!r.count) return toast('Nothing to share: only sounds clipped from YouTube can be shared.');
  const what = r.count === 1 ? 'this sound' : `${r.count} sounds`;
  toast(r.links > 1 ? `Copied ${r.links} links for ${what}. Paste them in a chat.` : `Copied a link for ${what}. Paste it in a chat.`);
}
async function shareSelected() {
  const ids = state.sounds.filter((s) => selecting && selecting.has(s.id)).map((s) => s.id);   // library order
  exitSelection();
  await copyShareLinks(ids);
}

// ---------- importing shared sounds ----------
const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${(Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(Number.isInteger(s) ? 2 : 4, '0')}`; };
let importItems = [];
let importRunning = false;

function openImport(result) {
  $('#import-modal').hidden = false;
  if (result) return showImportReview(result);
  $('#import-paste').hidden = false; $('#import-review-step').hidden = true;
  $('#import-text').value = ''; $('#import-text').focus();
}
function closeImport() { if (!importRunning) $('#import-modal').hidden = true; }

function importPicked() {
  return [...document.querySelectorAll('#import-list input:checked')].map((c) => Number(c.dataset.i));
}
function updateImportButton() {
  const n = importPicked().length;
  $('#import-go').textContent = n === 1 ? 'Import 1 sound' : `Import ${n} sounds`;
  $('#import-go').disabled = n === 0;
}

function showImportReview(result) {
  importItems = result.sounds;
  $('#import-paste').hidden = true; $('#import-review-step').hidden = false;
  $('#import-progress').hidden = true; $('#import-result').hidden = true; $('#import-result').textContent = '';
  $('#import-cancel-2').textContent = 'Cancel';
  const list = $('#import-list');
  list.textContent = '';
  importItems.forEach((e, i) => {
    const row = document.createElement('label');
    row.className = 'import-item' + (e.dup ? ' dup' : '');
    const box = document.createElement('input');
    box.type = 'checkbox'; box.checked = !e.dup; box.dataset.i = i;
    box.addEventListener('change', updateImportButton);
    const meta = document.createElement('div'); meta.className = 'meta';
    const title = document.createElement('div'); title.className = 'title'; title.textContent = e.name;
    const sub = document.createElement('div'); sub.className = 'sub';
    sub.textContent = `${fmtT(e.start)} – ${fmtT(e.end)} · ${(e.end - e.start).toFixed(1)} s` +
      (e.thumb ? ' · with thumbnail' : '') + (e.dup ? ' · already in your library' : '');
    meta.append(title, sub);
    row.append(box, meta);
    list.append(row);
  });
  const n = importItems.length;
  $('#import-summary').textContent = n
    ? `${n === 1 ? '1 sound was' : `${n} sounds were`} shared with you. They are re-cut from YouTube on this computer when you import.`
    : 'No sounds were found in that text.';
  $('#import-errors').textContent = result.errors.join(' ');
  $('#import-go').hidden = n === 0; $('#import-go').disabled = false;
  updateImportButton();
}

async function reviewPasted() {
  const text = $('#import-text').value.trim();
  if (!text) return;
  showImportReview(await window.api.parseShare(text));
}

async function runImport() {
  const picked = importPicked();
  if (!picked.length) return;
  importRunning = true;
  $('#import-go').hidden = true; $('#import-cancel-2').hidden = true;
  document.querySelectorAll('#import-list input').forEach((c) => { c.disabled = true; });
  $('#import-progress').hidden = false; $('#import-progress').textContent = 'Starting…';
  const r = await window.api.runShareImport(picked);
  importRunning = false;
  $('#import-progress').hidden = true;
  const out = $('#import-result');
  out.hidden = false; out.textContent = '';
  if (r.added.length) { const d = document.createElement('div'); d.className = 'okline'; d.textContent = `Added ${r.added.length} sound${r.added.length === 1 ? '' : 's'}.`; out.append(d); }
  for (const f of r.failed) { const d = document.createElement('div'); d.className = 'failline'; d.textContent = `${f.name ? f.name + ': ' : ''}${f.error}`; out.append(d); }
  $('#import-cancel-2').hidden = false; $('#import-cancel-2').textContent = 'Done';
}

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
    card.className = 'card' + (isShareable(s) ? '' : ' unshareable'); card.dataset.id = s.id;
    if (s.thumb) applyThumb(card, s.id);
    const pick = document.createElement('div'); pick.className = 'pick'; pick.setAttribute('aria-hidden', 'true');
    card.addEventListener('click', () => { if (selecting) togglePick(s.id); });

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

    const share = document.createElement('button');
    share.className = 'share'; share.title = 'Share'; share.setAttribute('aria-label', 'Share ' + s.name);
    share.innerHTML = SHARE_ICON;
    share.addEventListener('click', (e) => { e.stopPropagation(); toggleShareMenu(share, s.id); });

    const r1 = document.createElement('div'); r1.className = 'row'; r1.append(play$, keyBtn, share, del);
    const r2 = document.createElement('div'); r2.className = 'row'; r2.append(vol);
    card.append(pick, name, r1, r2);
    if (state.issues[s.id]) {
      const i = document.createElement('div'); i.className = 'issue'; i.textContent = '⚠ ' + state.issues[s.id];
      card.append(i);
    }
    grid.append(card);
  }
  renderPlaying();
  updateSelectionUi();
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

  // Offer the installer when no virtual cable exists, and ask on first launch.
  const hasCable = devs.some((d) => d.kind === 'audiooutput' && /cable input/i.test(d.label));
  $('#btn-cable').hidden = hasCable;
  // Re-arm the prompt once a cable has been seen, so a later removal + reinstall asks again.
  if (hasCable && state.settings.cablePrompted) window.api.setSettings({ cablePrompted: false });
  if (!onState.firstRun) {
    onState.firstRun = true;
    (async () => {
      if (!hasCable && !state.settings.cablePrompted) await window.api.firstRunCable();
      await window.api.firstRunExtension();
    })();
  }

  // Chromium issues new device ids each launch, so re-find saved devices by name. The virtual
  // cable is picked automatically unless the user deliberately chose "none".
  const s = state.settings;
  const patch = {};
  const resolve = (kind, idKey, labelKey, autoPattern) => {
    const id = s[idKey], label = s[labelKey];
    let match = devs.find((d) => d.kind === kind && id && d.deviceId === id);
    if (!match && label) match = devs.find((d) => d.kind === kind && d.label === label);
    if (!match && autoPattern && !label && !s.cableChosen) match = devs.find((d) => d.kind === kind && autoPattern.test(d.label));
    if (match && (match.deviceId !== id || match.label !== label)) { patch[idKey] = match.deviceId; patch[labelKey] = match.label; }
  };
  resolve('audioinput', 'micDeviceId', 'micDeviceLabel');
  resolve('audiooutput', 'cableDeviceId', 'cableDeviceLabel', /^CABLE Input/i);
  resolve('audiooutput', 'speakerDeviceId', 'speakerDeviceLabel');
  if (Object.keys(patch).length) return window.api.setSettings(patch);

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

  // Save the device's name next to its id: ids change between launches, names don't.
  const pick = (idKey, labelKey, extra = {}) => (e) => window.api.setSettings({
    [idKey]: e.target.value,
    [labelKey]: e.target.value ? e.target.selectedOptions[0].text : '',
    ...extra
  });
  $('#sel-mic').addEventListener('change', pick('micDeviceId', 'micDeviceLabel'));
  $('#sel-cable').addEventListener('change', pick('cableDeviceId', 'cableDeviceLabel', { cableChosen: true }));
  $('#sel-speaker').addEventListener('change', pick('speakerDeviceId', 'speakerDeviceLabel'));
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

  $('#menu-discord').addEventListener('click', () => { const id = shareFor; closeShareMenu(); if (id) window.api.exportDiscord(id); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#share-menu')) closeShareMenu(); });
  $('#menu-share-one').addEventListener('click', () => { const id = shareFor; closeShareMenu(); if (id) copyShareLinks([id]); });
  $('#menu-share-multi').addEventListener('click', () => { const id = shareFor; enterSelection(id); });
  $('#select-all').addEventListener('click', () => {
    if (!selecting) return;
    const all = state.sounds.filter(isShareable).map((s) => s.id);
    if (selecting.size === all.length) selecting.clear(); else all.forEach((id) => selecting.add(id));
    updateSelectionUi();
  });
  $('#select-cancel').addEventListener('click', exitSelection);
  $('#select-share').addEventListener('click', shareSelected);
  $('#btn-import').addEventListener('click', () => openImport());
  $('#import-cancel-1').addEventListener('click', closeImport);
  $('#import-cancel-2').addEventListener('click', closeImport);
  $('#import-review').addEventListener('click', reviewPasted);
  $('#import-go').addEventListener('click', runImport);
  window.api.onShareOpen((result) => openImport(result));
  window.api.onShareProgress(({ done, total, name }) => {
    if (done < total) $('#import-progress').textContent = `Importing ${done + 1} of ${total}: ${name}`;
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeShareMenu();
    if (!$('#import-modal').hidden) closeImport(); else if (selecting) exitSelection();
  });
  window.addEventListener('blur', closeShareMenu);
  $('#btn-extension-store').addEventListener('click', () => window.api.openExtensionStore());
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
