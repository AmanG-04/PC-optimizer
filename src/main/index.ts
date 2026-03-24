import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import si from 'systeminformation';

let mainWindow: BrowserWindow | null;
let monitoringActive = false;
let monitoringInterval: NodeJS.Timeout | null = null;

// System monitoring types
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

// Get system stats
async function getSystemStats(): Promise<SystemStats> {
  try {
    const [cpuData, memData, diskData] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
    ]);

    const totalDisk = diskData.reduce((sum, disk) => sum + disk.size, 0);
    const usedDisk = diskData.reduce((sum, disk) => sum + disk.used, 0);

    return {
      cpu: Math.round(cpuData.currentLoad * 10) / 10,
      ram: {
        used: Math.round(memData.active / 1024 / 1024 / 10) / 10, // MB
        total: Math.round(memData.total / 1024 / 1024 / 10) / 10, // MB
        percentage: Math.round((memData.active / memData.total) * 100 * 10) / 10,
      },
      disk: {
        used: Math.round(usedDisk / 1024 / 1024 / 1024 / 10) / 10, // GB
        total: Math.round(totalDisk / 1024 / 1024 / 1024 / 10) / 10, // GB
        percentage: Math.round((usedDisk / totalDisk) * 100 * 10) / 10,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Error fetching system stats:', error);
    throw error;
  }
}

// Start monitoring and broadcasting to renderer
function startMonitoring() {
  if (monitoringActive) return;

  monitoringActive = true;
  const POLLING_INTERVAL = 1500; // 1.5 seconds

  // Initial fetch
  getSystemStats()
    .then((stats) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-stats', stats);
      }
    })
    .catch((error) => console.error('Initial stats fetch failed:', error));

  // Set up periodic monitoring
  monitoringInterval = setInterval(async () => {
    try {
      const stats = await getSystemStats();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-stats', stats);
      }
    } catch (error) {
      console.error('Periodic stats fetch failed:', error);
    }
  }, POLLING_INTERVAL);
}

// Stop monitoring
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  monitoringActive = false;
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Determine if we're in dev or production
  const rendererPath = path.resolve(__dirname, '../renderer/index.html');
  const rendererExists = fs.existsSync(rendererPath);
  
  let startUrl: string;
  
  if (rendererExists) {
    // Production: load from file
    startUrl = `file://${rendererPath}`;
    console.log('[Electron] Loaded production build from:', startUrl);
  } else {
    // Development: load from Vite dev server
    startUrl = 'http://localhost:5173';
    console.log('[Electron] Loading dev server from:', startUrl);
  }

  mainWindow.loadURL(startUrl);

  // Open DevTools only in development mode
  if (!rendererExists) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopMonitoring();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    // Start monitoring when renderer is ready
    startMonitoring();
  });

  return mainWindow;
};

// IPC Handlers
ipcMain.handle('ping', async () => {
  return 'pong';
});

ipcMain.on('message', (event, arg) => {
  console.log('Message from renderer:', arg);
  event.reply('message-response', `Echo: ${arg}`);
});

// System monitoring IPC handlers
ipcMain.handle('get-system-stats', async () => {
  try {
    return await getSystemStats();
  } catch (error) {
    console.error('Error in get-system-stats handler:', error);
    throw error;
  }
});

ipcMain.on('start-monitoring', () => {
  console.log('Starting system monitoring');
  startMonitoring();
});

ipcMain.on('stop-monitoring', () => {
  console.log('Stopping system monitoring');
  stopMonitoring();
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // On macOS, apps should stay open until explicitly closed
  // For Windows, we'll quit the app
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
