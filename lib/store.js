const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  sounds: [],
  settings: {
    micDeviceId: '',       // real microphone ('' = system default)
    cableDeviceId: '',     // virtual cable playback device (e.g. "CABLE Input")
    speakerDeviceId: '',   // where you hear sounds ('' = system default output)
    micEnabled: true,      // pass the real mic through into the virtual mic
    monitorMic: false,     // also hear your own mic in your speakers
    masterVolume: 1,
    micGain: 1,
    soundsToMic: 1,
    soundsToSpeakers: 1,
    retrigger: 'overlap',  // overlap | restart | stop
    stopKey: ''
  }
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.sounds = Array.isArray(saved.sounds) ? saved.sounds : [];
      Object.assign(this.data.settings, saved.settings || {});
    } catch { /* first run or unreadable: use defaults */ }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = Store;
