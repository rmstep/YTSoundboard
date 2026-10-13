// Records a stretch of the playing video's audio from the player. Used when yt-dlp can't download a
// video because it needs a signed-in viewer (age-restricted videos): the user is already signed in
// and age-verified in their own browser, so the player can play it and we capture what it plays.
// The clip takes as long to record as it lasts.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(test, timeoutMs, message) {
    const t0 = performance.now();
    while (!test()) {
      if (performance.now() - t0 > timeoutMs) throw new Error(message);
      await sleep(25);
    }
  }

  // video: the page's <video>. start/end in seconds. opts.onProgress(seconds, total), opts.isBlocked() -> reason or ''.
  async function recordRange(video, start, end, opts = {}) {
    if (typeof video.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error('This browser cannot record audio from the player.');
    }
    const total = end - start;
    const wasMuted = video.muted;
    let recorder;
    try {
      video.pause();
      video.currentTime = Math.max(0, start - 0.4);   // a short run-up so recording begins right at `start`
      await waitFor(() => !video.seeking, 4000, 'The player did not seek to the clip start.');
      await video.play();
      const stream = video.captureStream();
      await waitFor(() => stream.getAudioTracks().length > 0, 4000, 'No audio could be captured from the player.');
      // Do not mute: a muted <video> yields an empty capture. The clip plays aloud while it records.
      if (video.muted) video.muted = false;
      await waitFor(() => video.currentTime >= start, 4000, 'The video did not start playing.');

      const chunks = [];
      const track = new MediaStream(stream.getAudioTracks());
      recorder = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? new MediaRecorder(track, { mimeType: 'audio/webm;codecs=opus' })
        : new MediaRecorder(track);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start(250);

      let pausedFor = 0;
      for (;;) {
        const played = Math.max(0, Math.min(video.currentTime - start, total));
        if (opts.onProgress) opts.onProgress(played, total);
        const blocked = opts.isBlocked && opts.isBlocked();
        if (blocked) throw new Error(blocked);
        if (video.currentTime >= end || video.ended) break;
        pausedFor = video.paused ? pausedFor + 50 : 0;
        if (pausedFor > 1500) throw new Error('Recording stopped because the video was paused.');
        await sleep(50);
      }
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) throw new Error('The recording was empty.');
      return blob;
    } finally {
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      video.pause();
      video.muted = wasMuted;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Could not read the recording.'));
      fr.readAsDataURL(blob);
    });
  }

  const api = { recordRange, blobToBase64 };
  if (typeof module !== 'undefined') module.exports = api; else window.YTSRecord = api;
})();
