# Chrome Web Store listing: YTSoundboard Clipper

Upload: `dist/ytsoundboard-extension.zip` (run `npm run extension-zip` to rebuild).

## Store listing tab

**Name:** YTSoundboard Clipper  (taken from manifest)
**Summary (max 132 chars):** Clip YouTube moments into hotkey sounds. Needs the free YTSoundboard app: github.com/rmstep/YTSoundboard-releases
**Category:** Productivity (or Entertainment)
**Language:** English

**Description:**
YTSoundboard Clipper turns any YouTube moment into a soundboard sound.

On a YouTube video, click the YTSoundboard button (bottom right). Drag the start and end handles or use the "now" buttons, preview the range, name the sound, pick a hotkey, and click Add. The clip lands in the YTSoundboard desktop app, ready to play into your microphone (Discord, games, OBS) and your speakers with a keypress or a Stream Deck button. Optionally use the video's thumbnail as the sound's background.

Requires the free YTSoundboard app for Windows: https://github.com/rmstep/YTSoundboard-releases/releases/latest

The extension talks only to the app running on your own computer. No accounts, no tracking, no data collected.

**Assets needed (you create these):**
- At least 1 screenshot, 1280x800 or 640x400 (the clipper panel open over a video works well; one of the app window is a good second).
- Small promo tile 440x280 (required by the dashboard).
- Store icon 128x128 is already in the package.

## Update 1.2.0 (what to enter when submitting the update)

**What's new:** The clip now defaults to the most replayed 7 seconds of the video (using YouTube's own replay graph), shows that graph on the timeline, and has a "Most replayed" button to jump back to it. Also fixes the clip length being read from an ad, and the sound name lagging behind the video title.

**Permissions:** unchanged. The extension requests the video's own watch page from youtube.com (same origin, no new host permission) to read the replay graph. Mention this in the permission justification:
```
The extension also reads YouTube's "Most replayed" graph by requesting the current video's own watch page from youtube.com (same site it already runs on) to suggest a default start time. The data is used locally and never stored or sent anywhere.
```
The privacy policy has been updated to say so (last updated October 8, 2026).

## Privacy tab

**Single purpose:** Let the user select a start and end time on a YouTube video and send that clip to the YTSoundboard desktop app on their computer.

**Permission justifications**
- *Host permission `http://127.0.0.1:38917/*`:* Needed to send the selected clip details to the YTSoundboard desktop app, which listens only on the user's own computer (localhost). No other host is contacted.
- *Content script on `https://www.youtube.com/*` and `https://m.youtube.com/*`:* Needed to show the clip-selection panel on YouTube and read the video's playback time, id and title.
- *Remote code:* No, the extension does not use remote code.

**Data usage:** The extension handles website content (video address, title, selected times) but only passes it to the app on the user's own computer. Nothing is sent to the developer or any third party. Certify that you do not sell data, use it for unrelated purposes, or use it for creditworthiness or lending.
Check none of the "data collected" boxes unless you decide otherwise.

**Privacy policy URL:** https://github.com/rmstep/YTSoundboard-releases/blob/main/PRIVACY.md

## Notes for the reviewer (Test instructions field)
The extension sends clips to a companion Windows app (installer: https://github.com/rmstep/YTSoundboard-releases/releases/latest). Without the app, the panel on youtube.com still opens and shows a red status dot with the message "YTSoundboard app is not running"; with the app running the dot is green and "Add to soundboard" creates the sound.

## Distribution tab
Visibility: Public, or Unlisted if you only want people with the link to find it.
