// Global hotkeys that do NOT swallow the key.
//
// Electron's globalShortcut uses RegisterHotKey on Windows, which consumes the key press system-wide, so
// a game never sees it (F1 in the game stops working while the soundboard has F1 bound). A low-level keyboard
// hook (uiohook-napi) only listens, so the key still reaches the focused app. If the hook can't load we fall
// back to globalShortcut so hotkeys at least keep working.
const { globalShortcut } = require('electron');

let uio = null;
try { uio = require('uiohook-napi'); } catch { /* native module missing: use globalShortcut */ }

const NAMED = {
  Space: 'Space', Enter: 'Enter', Return: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Escape: 'Escape', Esc: 'Escape',
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  '-': 'Minus', '=': 'Equal', ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
  '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '`': 'Backquote',
  numadd: 'NumpadAdd', numsub: 'NumpadSubtract', nummult: 'NumpadMultiply', numdiv: 'NumpadDivide', numdec: 'NumpadDecimal'
};

// "Ctrl+Alt+F1" -> { ctrl, alt, shift, meta, keycode } (null if it can't be mapped)
function parseAccelerator(accel, keys) {
  const mods = { ctrl: false, alt: false, shift: false, meta: false };
  let key = null;
  for (const raw of String(accel).split('+')) {
    const part = raw.trim();
    const m = part.toLowerCase();
    if (m === 'ctrl' || m === 'control' || m === 'commandorcontrol' || m === 'cmdorctrl') mods.ctrl = true;
    else if (m === 'alt' || m === 'option') mods.alt = true;
    else if (m === 'shift') mods.shift = true;
    else if (m === 'super' || m === 'meta' || m === 'cmd' || m === 'command') mods.meta = true;
    else key = part;
  }
  if (!key) return null;
  let name;
  if (/^[a-z]$/i.test(key)) name = key.toUpperCase();
  else if (/^\d$/.test(key)) name = key;
  else if (/^f\d{1,2}$/i.test(key)) name = key.toUpperCase();
  else if (/^num\d$/i.test(key)) name = 'Numpad' + key.slice(3);
  else name = NAMED[key] || NAMED[key.toLowerCase()];
  const keycode = name && keys[name];
  if (keycode === undefined) return null;
  return { ...mods, keycode };
}

const bindings = [];   // { spec, fn }
const down = new Set();
let hookStarted = false;

function onKeyDown(e) {
  if (down.has(e.keycode)) return;          // ignore auto-repeat while the key is held
  down.add(e.keycode);
  for (const b of bindings) {
    const s = b.spec;
    if (s.keycode === e.keycode && s.ctrl === !!e.ctrlKey && s.alt === !!e.altKey &&
        s.shift === !!e.shiftKey && s.meta === !!e.metaKey) {
      try { b.fn(); } catch { /* never let a handler kill the hook */ }
    }
  }
}
function onKeyUp(e) { down.delete(e.keycode); }

function startHook() {
  if (hookStarted) return true;
  try {
    uio.uIOhook.on('keydown', onKeyDown);
    uio.uIOhook.on('keyup', onKeyUp);
    uio.uIOhook.start();
    hookStarted = true;
  } catch { uio = null; }
  return hookStarted;
}

function unregisterAll() {
  bindings.length = 0;
  globalShortcut.unregisterAll();
}

// Returns true when the key was bound.
function register(accel, fn) {
  if (uio && startHook()) {
    const spec = parseAccelerator(accel, uio.UiohookKey);
    if (!spec) return false;
    bindings.push({ spec, fn });
    return true;
  }
  try { return globalShortcut.register(accel, fn); } catch { return false; }
}

function shutdown() {
  unregisterAll();
  if (hookStarted) { try { uio.uIOhook.stop(); } catch { /* ignore */ } hookStarted = false; }
}

module.exports = { register, unregisterAll, shutdown, parseAccelerator, passthrough: () => !!uio };
