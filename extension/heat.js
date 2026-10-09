// Reads YouTube's "Most replayed" data from a watch page and picks the best clip window.
// YouTube embeds it in the page HTML as a heat map: about 100 time buckets, each with a 0..1
// intensity score. (Its "Most replayed" label is only a callout at the start of the popular
// stretch, not the peak, so we ignore it and read the curve.) This is not an official API, so
// everything here fails soft: no data just means no default.
(() => {
  function parseHeat(html) {
    const i = html.indexOf('"markerType":"MARKER_TYPE_HEATMAP"');
    if (i < 0) return null;
    const seg = html.slice(i, html.indexOf(']', i));
    const markers = [...seg.matchAll(/"startMillis":"(\d+)","durationMillis":"(\d+)","intensityScoreNormalized":([\d.eE+-]+)/g)]
      .map((m) => ({ start: Number(m[1]) / 1000, dur: Number(m[2]) / 1000, v: Number(m[3]) }));
    return markers.length < 3 ? null : { markers };
  }

  const totalOf = (heat) => { const l = heat.markers[heat.markers.length - 1]; return l.start + l.dur; };

  // Replay intensity at time t, linearly interpolated between bucket centres. The first bucket is
  // inflated by everyone who just pressed play, so it borrows its neighbour's value.
  function makeCurve(heat) {
    const mk = heat.markers;
    const centres = mk.map((m) => m.start + m.dur / 2);
    const vals = mk.map((m) => m.v);
    if (mk.length > 10) vals[0] = vals[1];
    return (t) => {
      if (t <= centres[0]) return vals[0];
      for (let i = 1; i < centres.length; i++) {
        if (t <= centres[i]) { const f = (t - centres[i - 1]) / (centres[i] - centres[i - 1]); return vals[i - 1] + f * (vals[i] - vals[i - 1]); }
      }
      return vals[vals.length - 1];
    };
  }

  // The `len`-second window with the highest average replay intensity.
  function bestWindow(heat, duration, len = 7) {
    const total = duration || totalOf(heat);
    const L = Math.min(len, total);
    const at = makeCurve(heat);
    let best = { start: 0, score: -1 };
    for (let s = 0; s <= total - L + 1e-9; s += 0.25) {
      let sum = 0;
      for (let k = 0; k <= 8; k++) sum += at(s + (L * k) / 8);
      if (sum > best.score) best = { start: s, score: sum };
    }
    return { start: best.start, end: best.start + L };
  }

  // SVG area path of the replay curve, for drawing behind the timeline.
  function areaPath(heat, duration, w, h) {
    const total = duration || totalOf(heat);
    const at = makeCurve(heat);
    const pts = heat.markers.map((m) => { const t = m.start + m.dur / 2; return [(t / total) * w, h - Math.min(1, Math.max(0, at(t))) * (h - 4)]; });
    return `M0,${h} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${w},${h} Z`;
  }

  const api = { parseHeat, bestWindow, areaPath };
  if (typeof module !== 'undefined') module.exports = api; else window.YTSHeat = api;
})();
