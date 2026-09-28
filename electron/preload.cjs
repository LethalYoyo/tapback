const { contextBridge, ipcRenderer } = require('electron');
const call = channel => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('tapback', {
  state: call('state'), settings: call('settings'), stats: call('stats'),
  saveClip: call('clip:save'), readClip: call('clip:read'), updateClip: call('clip:update'), deleteClip: call('clip:delete'),
  exportPack: call('pack:export'), importPack: call('pack:import'),
  sensorStart: call('sensor:start'), sensorStop: call('sensor:stop'),
  microphone: call('microphone'), status: call('status'), hide: call('hide'),
  on: (channel, callback) => {
    if (!['action', 'sensor'].includes(channel)) return () => {};
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
