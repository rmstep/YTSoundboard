const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  readSound: (id) => ipcRenderer.invoke('sound:read', id),
  updateSound: (id, patch) => ipcRenderer.invoke('sound:update', id, patch),
  deleteSound: (id) => ipcRenderer.invoke('sound:delete', id),
  importSounds: () => ipcRenderer.invoke('sound:import'),
  suspendHotkeys: (on) => ipcRenderer.invoke('hotkeys:suspend', on),
  installStreamDeck: () => ipcRenderer.invoke('streamdeck:install'),
  readThumb: (id) => ipcRenderer.invoke('sound:thumb', id),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateReady: on('update-ready'),
  installCable: () => ipcRenderer.invoke('cable:install'),
  installTools: () => ipcRenderer.invoke('tools:install'),
  onState: on('state'),
  onTrigger: on('trigger'),
  onStopAll: on('stop-all'),
  onToast: on('toast')
});
