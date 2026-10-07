(() => {
  if (window.__autoSoundboardLoaded) return;
  window.__autoSoundboardLoaded = true;

  const MAX_CLIP = 120;
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

  const fmt = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  };
  const parse = (str) => {
    const parts = String(str).trim().split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return NaN;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };

  const getVideo = () => document.querySelector('video.html5-main-video') || document.querySelector('video');
  const getVideoId = () => {
    const u = new URL(location.href);
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/);
    return m ? m[1] : null;
  };
  const getTitle = () => document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim();

  // ---- UI inside a shadow root so YouTube's CSS and hotkeys can't interfere ----
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    * { box-sizing: border-box; font-family: "Segoe UI", Roboto, sans-serif; }
    .fab { background:#4f8cff; color:#fff; border:0; border-radius:22px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px #0007; }
    .panel { display:none; width:360px; background:#1c1f27; color:#e8eaf0; border:1px solid #2f3442; border-radius:12px; padding:14px; margin-bottom:10px; box-shadow:0 8px 28px #000a; font-size:13px; }
    .panel.open { display:block; }
    .head { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:600; }
    .dot { width:8px; height:8px; border-radius:50%; background:#e5484d; }
    .dot.on { background:#3fb950; }
    .title { color:#8b92a5; font-size:12px; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .track { position:relative; height:34px; margin:6px 8px 12px; touch-action:none; }
    .rail { position:absolute; top:15px; left:0; right:0; height:4px; background:#2f3442; border-radius:2px; }
    .sel { position:absolute; top:15px; height:4px; background:#4f8cff; border-radius:2px; }
    .head-pos { position:absolute; top:9px; width:2px; height:16px; background:#e8eaf0aa; margin-left:-1px; }
    .handle { position:absolute; top:6px; width:14px; height:22px; margin-left:-7px; background:#fff; border-radius:4px; cursor:ew-resize; border:2px solid #4f8cff; }
    .handle.end { border-color:#e5a14f; }
    .times { display:flex; gap:8px; margin-bottom:10px; }
    .times > div { flex:1; }
    label { display:block; font-size:11px; color:#8b92a5; margin-bottom:3px; }
    input, button.btn { width:100%; background:#232733; color:#e8eaf0; border:1px solid #2f3442; border-radius:6px; padding:6px 8px; font-size:13px; }
    .inline { display:flex; gap:4px; }
    .inline button { background:#232733; color:#e8eaf0; border:1px solid #2f3442; border-radius:6px; padding:0 8px; cursor:pointer; font-size:11px; white-space:nowrap; }
    .row { display:flex; gap:8px; margin-top:10px; }
    button.btn { cursor:pointer; text-align:center; }
    button.primary { background:#4f8cff; border-color:#4f8cff; color:#fff; font-weight:600; }
    button:disabled { opacity:.5; cursor:default; }
    .msg { margin-top:10px; font-size:12px; min-height:16px; }
    .msg.err { color:#ff7b80; } .msg.ok { color:#3fb950; }
    label.check { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:#e8eaf0; cursor:pointer; }
    label.check input { width:auto; margin:0; }
    .dur { color:#8b92a5; text-align:right; font-size:12px; margin:-6px 0 8px; }
  </style>
  <div class="panel" id="panel">
    <div class="head"><span class="dot" id="dot"></span><span>YTSoundboard clipper</span></div>
    <div class="title" id="title"></div>
    <div class="track" id="track">
      <div class="rail"></div><div class="sel" id="sel"></div><div class="head-pos" id="pos"></div>
      <div class="handle" id="h-start"></div><div class="handle end" id="h-end"></div>
    </div>
    <div class="dur" id="dur"></div>
    <div class="times">
      <div><label>Start</label><div class="inline"><input id="in-start"><button id="now-start" title="Use current playback time">now</button></div></div>
      <div><label>End</label><div class="inline"><input id="in-end"><button id="now-end" title="Use current playback time">now</button></div></div>
    </div>
    <label>Sound name</label><input id="in-name" maxlength="80">
    <div style="height:8px"></div>
    <label>Hotkey (click, then press keys · Esc clears)</label><input id="in-key" readonly placeholder="Click to assign">
    <label class="check"><input type="checkbox" id="in-thumb"> Use video thumbnail as the sound's background</label>
    <div class="row">
      <button class="btn" id="btn-preview">▶ Preview</button>
      <button class="btn primary" id="btn-add">Add to soundboard</button>
    </div>
    <div class="msg" id="msg"></div>
  </div>
  <button class="fab" id="fab">🔊 YTSoundboard</button>`;
  document.documentElement.appendChild(host);

  // Keep keystrokes in our UI away from YouTube's global shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, (e) => e.stopPropagation());

  const $ = (id) => root.getElementById(id);
  const st = { start: 0, end: 10, duration: 0, previewTimer: null, hotkey: '', videoId: null };

  function duration() {
    const v = getVideo();
    return v && Number.isFinite(v.duration) ? v.duration : 0;
  }
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function setMsg(text, cls = '') { const m = $('msg'); m.textContent = text; m.className = 'msg ' + cls; }

  function render() {
    const d = st.duration;
    $('in-start').value = fmt(st.start);
    $('in-end').value = fmt(st.end);
    const pct = (t) => (d ? (t / d) * 100 : 0) + '%';
    $('h-start').style.left = pct(st.start);
    $('h-end').style.left = pct(st.end);
    $('sel').style.left = pct(st.start);
    $('sel').style.width = d ? ((st.end - st.start) / d) * 100 + '%' : '0';
    const len = st.end - st.start;
    $('dur').textContent = `Clip length ${len.toFixed(1)}s` + (len > MAX_CLIP ? ` (max ${MAX_CLIP}s)` : '');
    $('dur').style.color = len > MAX_CLIP ? '#ff7b80' : '';
  }

  function syncVideo() {
    const id = getVideoId();
    if (id !== st.videoId) {
      st.videoId = id;
      $('in-name').value = getTitle().slice(0, 60);
      const d = duration();
      st.start = 0; st.end = Math.min(d || 10, 10);
    }
    st.duration = duration();
    if (st.end > st.duration && st.duration) st.end = st.duration;
    $('title').textContent = id ? getTitle() : 'Open a video to make a clip';
    render();
  }

  // --- draggable handles ---
  function drag(handle, which) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const rect = $('track').getBoundingClientRect();
      const move = (ev) => {
        const t = clamp((ev.clientX - rect.left) / rect.width, 0, 1) * st.duration;
        if (which === 'start') st.start = clamp(t, 0, st.end - 0.1);
        else st.end = clamp(t, st.start + 0.1, st.duration);
        render();
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        const v = getVideo();
        if (v) v.currentTime = which === 'start' ? st.start : Math.max(st.start, st.end - 1);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
  drag($('h-start'), 'start');
  drag($('h-end'), 'end');

  // --- text inputs / "now" buttons ---
  $('in-start').addEventListener('change', () => {
    const t = parse($('in-start').value);
    if (Number.isFinite(t)) st.start = clamp(t, 0, Math.max(0, st.duration - 0.1));
    if (st.end <= st.start) st.end = Math.min(st.duration, st.start + 5);
    render();
  });
  $('in-end').addEventListener('change', () => {
    const t = parse($('in-end').value);
    if (Number.isFinite(t)) st.end = clamp(t, st.start + 0.1, st.duration || t);
    render();
  });
  $('now-start').addEventListener('click', () => {
    const v = getVideo(); if (!v) return;
    st.start = clamp(v.currentTime, 0, st.duration);
    if (st.end <= st.start) st.end = Math.min(st.duration, st.start + 5);
    render();
  });
  $('now-end').addEventListener('click', () => {
    const v = getVideo(); if (!v) return;
    st.end = clamp(v.currentTime, st.start + 0.1, st.duration);
    render();
  });

  // --- playhead ---
  setInterval(() => {
    const v = getVideo();
    if (v && st.duration) $('pos').style.left = (v.currentTime / st.duration) * 100 + '%';
  }, 100);

  // --- preview ---
  function stopPreview() {
    clearInterval(st.previewTimer); st.previewTimer = null;
    $('btn-preview').textContent = '▶ Preview';
  }
  $('btn-preview').addEventListener('click', () => {
    const v = getVideo(); if (!v) return;
    if (st.previewTimer) { v.pause(); return stopPreview(); }
    v.currentTime = st.start; v.play();
    $('btn-preview').textContent = '■ Stop';
    st.previewTimer = setInterval(() => {
      if (v.currentTime >= st.end || v.paused) { v.pause(); stopPreview(); }
    }, 30);
  });

  // --- hotkey capture ---
  $('in-key').addEventListener('keydown', (e) => {
    e.preventDefault();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    if (e.key === 'Escape') { st.hotkey = ''; $('in-key').value = ''; return; }
    const accel = accelFromEvent(e);
    if (accel) { st.hotkey = accel; $('in-key').value = accel; }
  });

  // --- send to app ---
  $('btn-add').addEventListener('click', () => {
    const len = st.end - st.start;
    if (!st.videoId) return setMsg('Open a video first.', 'err');
    if (len <= 0 || len > MAX_CLIP) return setMsg(`Clip must be between 0 and ${MAX_CLIP} seconds.`, 'err');
    const btn = $('btn-add');
    btn.disabled = true; setMsg('Sending to YTSoundboard… this can take a few seconds.');
    chrome.runtime.sendMessage({
      type: 'clip',
      payload: {
        url: `https://www.youtube.com/watch?v=${st.videoId}`,
        start: st.start, end: st.end, name: $('in-name').value.trim(), key: st.hotkey, thumbnail: $('in-thumb').checked
      }
    }, (res) => {
      btn.disabled = false;
      if (chrome.runtime.lastError || !res) return setMsg('Could not reach the extension background.', 'err');
      if (!res.ok) return setMsg(res.error || 'Failed.', 'err');
      setMsg(res.warning || `Added "${res.sound.name}" to your soundboard.`, res.warning ? 'err' : 'ok');
    });
  });

  // --- connection status ---
  function ping() {
    chrome.runtime.sendMessage({ type: 'ping' }, (res) => {
      if (chrome.runtime.lastError) return;
      $('dot').classList.toggle('on', !!(res && res.ok));
    });
  }

  $('fab').addEventListener('click', () => {
    const open = $('panel').classList.toggle('open');
    if (open) { syncVideo(); ping(); }
  });

  setInterval(() => { if ($('panel').classList.contains('open')) { syncVideo(); ping(); } }, 1500);
})();
