// Accelerator -> uiohook keycode mapping. Run: node test/hotkeys.test.js (needs `npm install`).
const assert = require('assert');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (req, ...a) {            // lib/hotkeys requires electron; stub it outside Electron
  if (req === 'electron') return { globalShortcut: {} };
  return origLoad.call(this, req, ...a);
};
const { parseAccelerator } = require('../lib/hotkeys');
const { UiohookKey: K } = require('uiohook-napi');

assert.deepStrictEqual(parseAccelerator('F1', K), { ctrl: false, alt: false, shift: false, meta: false, keycode: K.F1 });
assert.strictEqual(parseAccelerator('Ctrl+Alt+F12', K).keycode, K.F12);
assert.ok(parseAccelerator('Ctrl+Alt+F12', K).ctrl && parseAccelerator('Ctrl+Alt+F12', K).alt);
assert.strictEqual(parseAccelerator('Shift+a', K).keycode, K.A);
assert.strictEqual(parseAccelerator('7', K).keycode, K['7']);
assert.strictEqual(parseAccelerator('num5', K).keycode, K.Numpad5);
assert.strictEqual(parseAccelerator('numadd', K).keycode, K.NumpadAdd);
assert.strictEqual(parseAccelerator('Super+Up', K).keycode, K.ArrowUp);
assert.ok(parseAccelerator('Super+Up', K).meta);
for (const [a, k] of [['-', 'Minus'], ['=', 'Equal'], ['`', 'Backquote'], ['\\', 'Backslash'], ["'", 'Quote'], ['Space', 'Space']])
  assert.strictEqual(parseAccelerator(a, K).keycode, K[k], a);
assert.strictEqual(parseAccelerator('Ctrl+', K), null);
assert.strictEqual(parseAccelerator('Bogus', K), null);
console.log('hotkeys ok');
