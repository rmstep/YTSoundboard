# YTSoundboard

Global-hotkey soundboard for Windows. Sounds play to your speakers **and** into a virtual microphone, so Discord, games, etc. hear them. A Chrome extension clips sounds straight from YouTube.

## Setup

1. `npm install` (already done), then run `start.bat` (or `npm start`). Closing the window keeps it in the tray so hotkeys keep working; quit from the tray icon.
2. **Install VB-Cable** (free virtual audio device): https://vb-audio.com/Cable/ — run `VBCABLE_Setup_x64.exe` as administrator and reboot. Windows cannot redirect a microphone without a driver like this.
3. In YTSoundboard, the **Virtual mic input** is auto-selected as `CABLE Input`. Pick your real mic under **Real microphone**.
4. In Discord/OBS/game voice chat, set the microphone to **`CABLE Output`**. People now hear your mic plus your sounds.
5. Load the extension: Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select the `extension` folder.

## Making sounds from YouTube

On a video, click **🔊 Soundboard** (bottom-right). Drag the start/end handles or use the **now** buttons, **Preview** the range, name it, click the hotkey box and press a key combo, then **Add to soundboard**. The app cuts the audio with yt-dlp + ffmpeg (max 120 s per clip). The panel's dot is green when the desktop app is running.

## Audio controls

Master volume, mic level, sounds→virtual mic, sounds→speakers, per-sound volume, optional mic passthrough, optional self-monitor, retrigger behaviour (overlap/restart/stop), a stop-all hotkey and a live level meter. You can also add local audio files.

## Notes

- Hotkeys are global (work while a game is focused). Games running as administrator may block them unless YTSoundboard is also run as admin.
- If a clip fails, YouTube probably changed something: update yt-dlp (`yt-dlp -U`, or `winget upgrade yt-dlp`).
- The local API listens on `127.0.0.1:38917` only and accepts clip requests only from browser extensions.
- Only clip content you have the right to use.
