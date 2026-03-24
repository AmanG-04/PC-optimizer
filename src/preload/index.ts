import { contextBridge, ipcRenderer } from 'electron';

// System stats types
interface SystemStats {
  cpu: number;
  cpuSources?: {
    windowsUtility: number | null;
    sampledDelta: number;
    systemInformationLoad: number;
  };
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

interface CleanJunkResult {
  success: boolean;
  deletedCount: number;
  skippedCount: number;
  failedCount: number;
  message: string;
}

interface PowerShellExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  message: string;
}

interface StartupAppEntry {
  name: string;
  command: string;
  type: string;
  status: 'enabled' | 'disabled' | 'unknown';
  inRunKey: boolean;
  location: 'HKCU' | 'HKLM';
}

interface StartupActionResult {
  success: boolean;
  message: string;
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
  cleanJunk: () => ipcRenderer.invoke('clean-junk'),
  executePowerShell: (command: string) => ipcRenderer.invoke('execute-powershell', command),
  getStartupApps: () => ipcRenderer.invoke('get-startup-apps'),
  removeStartupApp: (name: string, location: 'HKCU' | 'HKLM') =>
    ipcRenderer.invoke('remove-startup-app', name, location),
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
      cleanJunk: () => Promise<CleanJunkResult>;
      executePowerShell: (command: string) => Promise<PowerShellExecResult>;
      getStartupApps: () => Promise<StartupAppEntry[]>;
      removeStartupApp: (name: string, location: 'HKCU' | 'HKLM') => Promise<StartupActionResult>;
    };
  }
}
