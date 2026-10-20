// The YTSoundboard share-link format, used by the app (lib/) and copied to the website (docs/share.js).
// A link carries no audio, only a recipe: for each sound, the YouTube video id, start, end, whether to
// use the thumbnail, and the title. Everything after the "#" stays in the browser and never reaches a server.
//
//   https://rmstep.github.io/YTSoundboard-releases/clip/#c=<id>~<start>~<end>~<thumb 0|1>~<title>&c=...
//   ytsoundboard://import?c=<id>~<start>~<end>~<thumb 0|1>~<title>&c=...
//
// The title is percent-encoded, including characters that URLs usually leave alone ( ! ' ( ) * ~ . ), so the
// separators are unambiguous and punctuation a chat app tacks onto a link can be stripped safely.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YTSShare = factory();
})(this, function () {
  const PAGE = 'https://rmstep.github.io/YTSoundboard-releases/clip/';
  const ID_RE = /^[\w-]{11}$/;
  const NUM_RE = /^\d+(?:\.\d{1,3})?$/;
  const MAX_ENTRIES = 100;
  const MAX_NAME = 80;
  const SANE_MAX_SECONDS = 3600;   // structural sanity only; the app enforces its own clip-length cap on import

  const num = (n) => String(Number(Number(n).toFixed(2)));
  const wellFormed = (s) => (typeof s.toWellFormed === 'function' ? s.toWellFormed() : s);
  const encName = (s) => encodeURIComponent(wellFormed(String(s)))
    .replace(/[!'()*~.]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

  function cleanName(s) {
    const t = String(s || '').replace(/[\t\n\r]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    return t || 'Shared sound';
  }

  const encodeEntry = (e) => [e.id, num(e.start), num(e.end), e.thumb ? 1 : 0, encName(cleanName(e.name))].join('~');
  const payload = (entries) => entries.map((e) => 'c=' + encodeEntry(e)).join('&');

  // One or more page links. A chat message holds roughly 2000 characters, so a long list is split.
  function buildLinks(entries, { base = PAGE, maxLen = 1800 } = {}) {
    const links = [];
    let cur = [];
    for (const e of entries) {
      const next = cur.concat(e);
      if (cur.length && (base + '#' + payload(next)).length > maxLen) { links.push(base + '#' + payload(cur)); cur = [e]; }
      else cur = next;
    }
    if (cur.length) links.push(base + '#' + payload(cur));
    return links;
  }

  const appLink = (entries) => 'ytsoundboard://import?' + payload(entries);

  // Pull every sound out of pasted text: a page link, an app link, several of either, or a bare "c=..." string.
  function parseShare(text) {
    const sounds = [];
    const errors = [];
    const seen = new Set();
    const re = /(?:^|[?#&\s<(\["'])c=([A-Za-z0-9_\-.~%]+)/g;
    let m;
    let index = 0;
    while ((m = re.exec(String(text || '')))) {
      index++;
      if (index > MAX_ENTRIES) { errors.push(`Only the first ${MAX_ENTRIES} sounds are used.`); break; }
      const token = m[1].replace(/\.+$/, '');          // a sentence's final full stop is never part of a title
      const p = token.split('~');
      const fail = (why) => errors.push(`Sound ${index} is not valid (${why}).`);
      if (p.length !== 5) { fail('wrong shape'); continue; }
      const [id, s, e, t, rawName] = p;
      if (!ID_RE.test(id)) { fail('bad video id'); continue; }
      if (!NUM_RE.test(s) || !NUM_RE.test(e)) { fail('bad times'); continue; }
      const start = Number(s), end = Number(e);
      if (!(end > start) || end - start > SANE_MAX_SECONDS) { fail('bad time range'); continue; }
      if (t !== '0' && t !== '1') { fail('bad thumbnail flag'); continue; }
      let name;
      try { name = decodeURIComponent(rawName); } catch { name = rawName; }
      const entry = { id, start, end, thumb: t === '1', name: cleanName(name) };
      const key = `${id}|${start}|${end}`;
      if (seen.has(key)) continue;                      // the same pasted link twice
      seen.add(key);
      sounds.push(entry);
    }
    return { sounds, errors };
  }

  return { PAGE, MAX_ENTRIES, buildLinks, appLink, parseShare, payload, cleanName };
});
