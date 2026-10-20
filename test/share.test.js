// Run with: node test/share.test.js
const { buildLinks, appLink, parseShare, payload, cleanName } = require('../lib/share.js');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
const entry = (over = {}) => ({ id: 'jNQXAC9IVRw', start: 3, end: 10.25, thumb: true, name: 'Airhorn', ...over });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. A round trip keeps everything.
let links = buildLinks([entry()]);
assert(links.length === 1 && links[0].startsWith('https://rmstep.github.io/YTSoundboard-releases/clip/#c=jNQXAC9IVRw~3~10.25~1~Airhorn'), 'link shape: ' + links[0]);
let r = parseShare(links[0]);
assert(r.errors.length === 0 && same(r.sounds, [entry()]), 'single round trip');

// 2. Awkward titles survive: the separators, URL syntax, punctuation, unicode, emoji, and a title that is only a dot.
const awkward = ['a~b', 'Tom & Jerry #1', 'Wait... what?!', "It's (really) *loud*", '100% done', 'Ünï cödé 日本語', 'Boom 💥 clap', 'ends with.', '...', 'a=b&c=d'];
for (const name of awkward) {
  const out = parseShare(buildLinks([entry({ name })])[0]);
  assert(out.errors.length === 0 && out.sounds.length === 1 && out.sounds[0].name === name, `title survives: ${JSON.stringify(name)} -> ${JSON.stringify(out.sounds[0] && out.sounds[0].name)}`);
}

// 3. Several sounds in one link, order kept.
const many = [entry({ name: 'One' }), entry({ id: 'dQw4w9WgXcQ', start: 0, end: 5, thumb: false, name: 'Two' }), entry({ id: 'aaaaaaaaaaa', start: 1.5, end: 2.5, name: 'Three' })];
links = buildLinks(many);
assert(links.length === 1, 'three sounds fit one link');
r = parseShare(links[0]);
assert(same(r.sounds, many), 'order and fields kept for several sounds');
assert(r.sounds[1].thumb === false && r.sounds[0].thumb === true, 'thumbnail flags per sound');

// 4. A long list is split into several links, none over the limit, nothing lost.
const lots = Array.from({ length: 60 }, (_, i) => entry({ id: 'v'.repeat(10) + String.fromCharCode(97 + (i % 26)), start: i, end: i + 7, name: 'Sound number ' + i }));
links = buildLinks(lots);
assert(links.length > 1 && links.every((l) => l.length <= 1800), 'split into links under the chat limit: ' + links.map((l) => l.length));
const got = links.flatMap((l) => parseShare(l).sounds);
assert(got.length === 60 && got.every((s, i) => s.name === 'Sound number ' + i), 'nothing lost across split links');
assert(parseShare(links.join('\n\n')).sounds.length === 60, 'all links pasted together import everything');

// 5. Text copied out of chat apps: surrounding words, angle brackets, trailing punctuation, markdown.
const link = buildLinks([entry({ name: 'Wow' })])[0];
for (const wrapped of [`check this out: ${link}`, `<${link}>`, `(${link})`, `${link}.`, `${link},`, `"${link}"`, `[sound](${link})`, `\n\n  ${link}  \n`]) {
  const out = parseShare(wrapped);
  assert(out.sounds.length === 1 && out.sounds[0].name === 'Wow', `survives wrapping: ${JSON.stringify(wrapped.slice(0, 30))}...`);
}

// 6. The app link and a bare payload parse the same as the page link.
assert(same(parseShare(appLink(many)).sounds, many), 'ytsoundboard:// link');
assert(same(parseShare(payload(many)).sounds, many), 'bare payload');

// 7. Hostile or broken input is rejected, never half-accepted.
const bad = [
  'c=short~1~2~0~x',                                  // bad video id length
  'c=jNQXAC9IVRw~5~5~0~x',                            // zero length
  'c=jNQXAC9IVRw~9~3~0~x',                            // end before start
  'c=jNQXAC9IVRw~0~99999~0~x',                        // absurd length
  'c=jNQXAC9IVRw~-1~3~0~x',                           // negative
  'c=jNQXAC9IVRw~1e3~3~0~x',                          // exponent notation
  'c=jNQXAC9IVRw~1~3~2~x',                            // bad thumbnail flag
  'c=jNQXAC9IVRw~1~3~0',                              // missing title
  'c=jNQXAC9IVRw~1~3~0~x~extra',                      // too many fields
  'c=https%3A%2F%2Fevil.example%2Fx~1~3~0~x',         // a URL where an id belongs
  'c=jNQXAC9IVR!~1~3~0~x'                             // illegal id character
];
for (const b of bad) {
  const out = parseShare(b);
  assert(out.sounds.length === 0 && out.errors.length === 1, `rejects: ${b}`);
}
assert(parseShare('').sounds.length === 0 && parseShare('hello world').sounds.length === 0 && parseShare(null).sounds.length === 0, 'text with no sounds');

// 8. One bad entry does not poison the good ones.
r = parseShare(`${link} c=bogus~1~2~0~x`);
assert(r.sounds.length === 1 && r.errors.length === 1, 'good entry kept, bad one reported');

// 9. Duplicates collapse; titles are cleaned and capped.
r = parseShare(`${link} ${link}`);
assert(r.sounds.length === 1, 'the same sound pasted twice is one sound');
assert(cleanName('  a\u0000b\n c  ') === 'ab c' && cleanName('line one\nline two') === 'line one line two' && cleanName('x'.repeat(200)).length === 80 && cleanName('   ') === 'Shared sound', 'name cleaning');
r = parseShare('c=jNQXAC9IVRw~1~3~0~%E0%A4%A');       // broken percent-escape must not throw
assert(r.sounds.length === 1, 'a broken escape sequence does not crash parsing');

// 10. Entry cap.
const huge = Array.from({ length: 150 }, (_, i) => `c=jNQXAC9IVRw~${i}~${i + 1}~0~n${i}`).join('&');
r = parseShare(huge);
assert(r.sounds.length === 100 && r.errors.length === 1, 'capped at 100 sounds');

console.log('All share-link tests passed');
