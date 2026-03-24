import { contextBridge, ipcRenderer } from 'electron';

// System stats types
interface SystemStats {
  cpu: number;
  ram: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  timestamp: number;
}

// Expose IPC functionality to renderer process
contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
  sendMessage: (message: string) => {
    ipcRenderer.send('message', message);
  },
  onMessageResponse: (callback: (response: string) => void) => {
    ipcRenderer.on('message-response', (_event, response) => {
      callback(response);
    });
  },

  // System monitoring API
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  startMonitoring: () => ipcRenderer.send('start-monitoring'),
  stopMonitoring: () => ipcRenderer.send('stop-monitoring'),
  onSystemStats: (callback: (stats: SystemStats) => void) => {
    ipcRenderer.on('system-stats', (_event, stats) => {
      callback(stats);
    });
  },
});

// Type definitions for the exposed API
declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;
      sendMessage: (message: string) => void;
      onMessageResponse: (callback: (response: string) => void) => void;
      getSystemStats: () => Promise<SystemStats>;
      startMonitoring: () => void;
      stopMonitoring: () => void;
      onSystemStats: (callback: (stats: SystemStats) => void) => void;
    };
  }
}
