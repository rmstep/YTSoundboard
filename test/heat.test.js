// Run with: node test/heat.test.js
const { parseHeat, bestWindow, areaPath } = require('../extension/heat.js');

const mk = (vals, dur) => ({ markers: vals.map((v, i) => ({ start: i * dur, dur, v })) });
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

// A clear peak at 120-129s of a 300s video; the first bucket is inflated like a real heat map.
let vals = Array.from({ length: 100 }, () => 0.2);
vals[0] = 1; vals[40] = 0.8; vals[41] = 1; vals[42] = 0.8;
let w = bestWindow(mk(vals, 3), 300, 7);
assert(Math.abs((w.start + w.end) / 2 - 124.5) < 2, 'window centres on the real peak, not the inflated first bucket');
assert(Math.abs(w.end - w.start - 7) < 1e-9, 'window is 7 seconds');

// A peak at the very end stays inside the video.
vals = Array.from({ length: 100 }, () => 0.1); vals[99] = 1;
w = bestWindow(mk(vals, 3), 300, 7);
assert(w.start >= 0 && w.end <= 300 + 1e-9, 'window is clamped to the video');

// A video shorter than the window uses all of it.
w = bestWindow(mk([0.1, 0.5, 0.9, 0.5, 0.1], 0.8), 4, 7);
assert(w.start === 0 && Math.abs(w.end - 4) < 1e-9, 'short video uses the whole video');

// Parsing, using the shape YouTube embeds in the watch page.
const m = (s, d, v) => `{"startMillis":"${s}","durationMillis":"${d}","intensityScoreNormalized":${v}}`;
const html = `...,"markerType":"MARKER_TYPE_HEATMAP","markers":[${m(0, 2960, 1)},${m(2960, 2960, 0.5)},${m(5920, 2960, '2.4e-3')}],"markersMetadata":{}`;
const h = parseHeat(html);
assert(h && h.markers.length === 3, 'parses three markers');
assert(h.markers[2].v === 0.0024 && h.markers[1].start === 2.96, 'parses exponents and converts millis to seconds');
assert(parseHeat('<html>no heat map here</html>') === null, 'no heat data gives null');
assert(parseHeat('"markerType":"MARKER_TYPE_HEATMAP","markers":[]') === null, 'empty heat data gives null');
assert(/^M0,34 L/.test(areaPath(h, 9, 100, 34)), 'area path is built');

console.log('All heat tests passed');
