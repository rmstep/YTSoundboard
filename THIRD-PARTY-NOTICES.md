# Third-party notices

YTSoundboard's own code is MIT licensed (see `LICENSE`). The installer also contains or uses the following. Each keeps its own license.

| Component | License | How it's used |
|---|---|---|
| [Electron](https://www.electronjs.org) (includes Chromium and Node.js) | MIT, plus Chromium's third-party licenses (shipped as `LICENSES.chromium.html` in the install folder) | Application runtime |
| [electron-updater](https://github.com/electron-userland/electron-builder) | MIT | Auto-update from GitHub Releases |
| [ws](https://github.com/websockets/ws) | MIT | Stream Deck plugin WebSocket client |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense (public domain) | Bundled executable; downloads the selected YouTube audio |
| [FFmpeg](https://ffmpeg.org) | GPL-3.0-or-later | Bundled **separate executable** (`resources/bin/ffmpeg.exe`) that the app launches to cut and convert audio. It is not linked into YTSoundboard. |
| [VB-Cable](https://vb-audio.com/Cable/) | Proprietary (VB-Audio Software) | **Not bundled.** Downloaded from vb-audio.com on request and installed with VB-Audio's own signed installer. |

## FFmpeg (GPLv3) source

The bundled `ffmpeg.exe` comes from the [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) npm package (v5.3.0, binary release `b6.1.1`, FFmpeg 6.1.1).

- FFmpeg source: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
- Build scripts and binary releases: https://github.com/eugeneware/ffmpeg-static
- GPLv3 text: https://www.gnu.org/licenses/gpl-3.0.html

You may replace the bundled `ffmpeg.exe` with any compatible build. Because it is a separate program invoked as a subprocess, FFmpeg's license applies to FFmpeg only and does not change the MIT license of YTSoundboard's source.

## Trademarks

YouTube is a trademark of Google LLC. This project is not affiliated with or endorsed by Google, VB-Audio, Elgato, or the other products named here.
