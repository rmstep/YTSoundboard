# YTSoundboard

A hotkey soundboard for Windows. Clip a moment from any YouTube video, give it a key, and play it into your microphone (Discord, games, OBS) and your speakers at the same time. Works with Stream Deck.

**[Website](https://rmstep.github.io/YTSoundboard-releases/)** · **[Download the installer](https://github.com/rmstep/YTSoundboard-releases/releases/latest)** · [Chrome extension](https://chromewebstore.google.com/detail/ytsoundboard-clipper/cdcjmelhnjmfgekefemeiklnlomilhhe) · [Privacy policy](https://github.com/rmstep/YTSoundboard-releases/blob/main/PRIVACY.md) · MIT licensed

## How it works

- **Desktop app** (Electron): global hotkeys, a library of sounds, and an audio engine built on Web Audio. Each sound plays to two outputs at once: your speakers, and a virtual audio cable that carries your mic plus the sounds.
- **Virtual mic:** Windows can't redirect a microphone without a driver. The app uses [VB-Cable](https://vb-audio.com/Cable/) (not bundled; the app downloads it from VB-Audio and verifies its signature). In Discord/OBS/games, choose **CABLE Output** as the microphone.
- **Chrome extension** (`extension/`, [on the Chrome Web Store](https://chromewebstore.google.com/detail/ytsoundboard-clipper/cdcjmelhnjmfgekefemeiklnlomilhhe)): adds a clip picker on youtube.com. It defaults the clip to the most replayed 7 seconds (read from YouTube's replay graph, see `extension/heat.js`), then sends the video id and times to the app over `127.0.0.1:38917`, and the app cuts the audio with yt-dlp and ffmpeg.
- **Share to Discord:** each sound has a share button. "Show Files (upload to Discord)" saves the full clip as an MP3 named after the sound in `Documents\YTSoundboard\Discord exports` and opens it in Explorer. Discord's soundboard only accepts MP3/Ogg, which is why the app's own WAV storage can't be dropped in directly.
- **Stream Deck plugin** (`streamdeck-plugin/`): "Play Sound" and "Stop All" keys that show each sound's name and thumbnail.
- **Auto-update:** installed copies check [YTSoundboard-releases](https://github.com/rmstep/YTSoundboard-releases) via electron-updater.

## Develop

Requires Windows, Node.js 20+, and optionally ffmpeg and yt-dlp on your PATH (the packaged app bundles both).

```bash
npm install
npm start          # run the app
npm run dist       # build the installer into dist/
```

Load the extension for development: `chrome://extensions` → Developer mode → Load unpacked → `extension/`. Run the unit tests with `npm test`.

### Releasing

```bash
# bump "version" in package.json (and extension/manifest.json if it changed)
gh auth login                      # once
npm run release                    # builds and uploads to the releases repo
```

Other scripts: `npm run icons` (regenerates icons), `npm run extension-zip` (Chrome Web Store package), `npm run streamdeck` (packs the Stream Deck plugin), `npx electron scripts/make-promo.js` (Web Store promo tiles).

### Project layout

| Path | What |
|---|---|
| `main.js`, `preload.js` | Electron main process: hotkeys, tray, local API, auto-update |
| `src/` | App window UI and the audio engine (`renderer.js`) |
| `lib/` | yt-dlp wrapper, local HTTP server, VB-Cable installer, config store |
| `extension/` | Chrome extension (Manifest V3) |
| `streamdeck-plugin/` | Stream Deck plugin |
| `scripts/` | Build and release helpers |

## Security notes

The local API listens on loopback only. Clip requests are accepted only from browser extensions, and the Stream Deck routes need a custom header that web pages can't send cross-origin. Only YouTube URLs are accepted, and they are rebuilt from the video id before reaching yt-dlp.

## License

MIT, see [LICENSE](LICENSE). Bundled third-party software and its licenses are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Only clip content you have the right to use.
