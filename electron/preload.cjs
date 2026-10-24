const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ide', {
  openProject: () => ipcRenderer.invoke('project:open'),
  refreshProject: () => ipcRenderer.invoke('project:refresh'),
  readFile: path => ipcRenderer.invoke('file:read', path),
  saveFile: (path, content) => ipcRenderer.invoke('file:save', path, content),
  createFile: path => ipcRenderer.invoke('project:create-file', path),
  createFolder: path => ipcRenderer.invoke('project:create-folder', path),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('project:rename', oldPath, newPath),
  deletePath: path => ipcRenderer.invoke('project:delete', path),
  searchProject: query => ipcRenderer.invoke('project:search', query),
  gitStatus: () => ipcRenderer.invoke('git:status'),
  gitDiff: () => ipcRenderer.invoke('git:diff'),
  runCommand: command => ipcRenderer.invoke('command:run', command),
  stopCommand: () => ipcRenderer.invoke('command:stop'),
  openPreview: url => ipcRenderer.invoke('preview:open', url),
  onCommandEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('command:event', listener);
    return () => ipcRenderer.removeListener('command:event', listener);
  },
  confirm: message => ipcRenderer.invoke('dialog:confirm', message),
  version: () => ipcRenderer.invoke('app:version'),
  pickModelRuntime: () => ipcRenderer.invoke('model:pick-runtime'),
  pickModelFile: () => ipcRenderer.invoke('model:pick-file'),
  recommendedModelPath: () => ipcRenderer.invoke('model:recommended-path'),
  modelRuntimePath: () => ipcRenderer.invoke('model:runtime-path'),
  downloadRecommendedModel: () => ipcRenderer.invoke('model:download-recommended'),
  onModelDownloadProgress: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('model:download-progress', listener);
    return () => ipcRenderer.removeListener('model:download-progress', listener);
  },
  startModel: threads => ipcRenderer.invoke('model:start', threads),
  useOllamaModel: tag => ipcRenderer.invoke('ollama:use-model', tag),
  stopModel: () => ipcRenderer.invoke('model:stop'),
  onModelEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('model:event', listener);
    return () => ipcRenderer.removeListener('model:event', listener);
  },
  integrationStatus: () => ipcRenderer.invoke('integrations:status'),
  integrationLogin: provider => ipcRenderer.invoke('integrations:login', provider),
  onIntegrationEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('integration:event', listener);
    return () => ipcRenderer.removeListener('integration:event', listener);
  }
});
