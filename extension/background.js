const BASE = 'http://127.0.0.1:38917';

async function call(path, options) {
  try {
    const res = await fetch(BASE + path, options);
    return await res.json();
  } catch {
    return { ok: false, error: 'AutoSoundboard app is not running' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') {
    call('/ping').then(sendResponse);
  } else if (msg.type === 'clip') {
    call('/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg.payload)
    }).then(sendResponse);
  } else {
    return false;
  }
  return true; // async response
});
