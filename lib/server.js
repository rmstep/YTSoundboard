const http = require('http');

const PORT = 38917;

// Local API used by the Chrome extension. Bound to loopback only. Mutating
// requests must come from a browser extension origin, which web pages cannot forge.
function startServer({ onClip, getInfo }) {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const fromExtension = origin.startsWith('chrome-extension://');
    if (fromExtension) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    if (req.method === 'OPTIONS') { res.writeHead(fromExtension ? 204 : 403); return res.end(); }
    if (req.method === 'GET' && req.url === '/ping') return send(200, { ok: true, app: 'YTSoundboard', ...getInfo() });

    if (req.method === 'POST' && req.url === '/clip') {
      if (!fromExtension) return send(403, { ok: false, error: 'Forbidden' });
      let body = '';
      let tooBig = false;
      req.on('data', (c) => { body += c; if (body.length > 10000) { tooBig = true; req.destroy(); } });
      req.on('end', async () => {
        if (tooBig) return;
        try {
          const p = JSON.parse(body);
          const result = await onClip({
            url: String(p.url || ''),
            start: Number(p.start),
            end: Number(p.end),
            name: String(p.name || '').slice(0, 80),
            key: String(p.key || '').slice(0, 40),
            thumbnail: p.thumbnail === true
          });
          send(200, { ok: true, ...result });
        } catch (e) {
          send(400, { ok: false, error: e.message });
        }
      });
      return;
    }
    send(404, { ok: false, error: 'Not found' });
  });

  server.on('error', (e) => console.error('Local server error:', e.message));
  server.listen(PORT, '127.0.0.1');
  return server;
}

module.exports = { startServer, PORT };
