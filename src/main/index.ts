import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec, execFile } from 'child_process';
import Winreg from 'winreg';
import si from 'systeminformation';

let mainWindow: BrowserWindow | null;
let monitoringActive = false;
let monitoringInterval: NodeJS.Timeout | null = null;

// System monitoring types
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

const JUNK_CLEAN_TARGET_DIR = 'C:\\Users\\Aman\\Desktop\\junk';
const STARTUP_REG_KEY = '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const STARTUP_APPROVED_REG_KEY = '\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function getWindowsCpuUtility(): Promise<number | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  const queryProperty = (property: 'PercentProcessorUtility' | 'PercentProcessorTime') =>
    new Promise<number | null>((resolve) => {
      execFile(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ProcessorInformation | Where-Object { $_.Name -eq '_Total' }).${property}`,
        ],
        { windowsHide: true, timeout: 3000 },
        (error, stdout) => {
          if (error || !stdout) {
            resolve(null);
            return;
          }

          const parsed = Number(String(stdout).trim());
          if (!Number.isFinite(parsed)) {
            resolve(null);
            return;
          }

          resolve(round1(clamp(parsed, 0, 100)));
        },
      );
    });

  const utility = await queryProperty('PercentProcessorUtility');
  if (utility !== null) {
    return utility;
  }

  // Fallback for systems without Utility exposed.
  return queryProperty('PercentProcessorTime');

}

function readCpuSnapshot(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }

  return { idle, total };
}

async function sampleCpuUsage(sampleMs = 350): Promise<number> {
  const start = readCpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = readCpuSnapshot();

  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;

  if (totalDelta <= 0) {
    return 0;
  }

  return round1((1 - idleDelta / totalDelta) * 100);
}

async function cleanWindowsTempDirectory(): Promise<CleanJunkResult> {
  const targetDir = path.resolve(JUNK_CLEAN_TARGET_DIR);
  const targetRoot = `${targetDir}${path.sep}`;
  const protectedNames = new Set([
    'windows',
    'system32',
    'syswow64',
    'program files',
    'program files (x86)',
    '$recycle.bin',
  ]);
  const protectedExtensions = new Set(['.sys', '.dll', '.exe', '.msi', '.bat', '.cmd']);

  let deletedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const isSafePath = (targetPath: string): boolean => {
    const resolved = path.resolve(targetPath);
    return resolved === targetDir || resolved.startsWith(targetRoot);
  };

  try {
    const stat = await fs.promises.stat(targetDir);
    if (!stat.isDirectory()) {
      return {
        success: false,
        deletedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        message: `Configured junk folder is not a directory: ${targetDir}`,
      };
    }
  } catch {
    return {
      success: false,
      deletedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      message: `Configured junk folder not found: ${targetDir}`,
    };
  }

  const walkAndClean = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      failedCount += 1;
      return;
    }

    for (const entry of entries) {
      const target = path.resolve(dir, entry.name);
      const lowerName = entry.name.toLowerCase();

      if (!isSafePath(target) || protectedNames.has(lowerName)) {
        skippedCount += 1;
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = await fs.promises.lstat(target);
      } catch {
        failedCount += 1;
        continue;
      }

      if (stat.isSymbolicLink()) {
        skippedCount += 1;
        continue;
      }

      if (stat.isDirectory()) {
        await walkAndClean(target);
        try {
          await fs.promises.rmdir(target);
        } catch {
          // Directory not empty or in use; expected in temp trees.
        }
        continue;
      }

      if (!stat.isFile()) {
        skippedCount += 1;
        continue;
      }

      const ext = path.extname(lowerName);
      if (protectedExtensions.has(ext)) {
        skippedCount += 1;
        continue;
      }

      try {
        await fs.promises.unlink(target);
        deletedCount += 1;
      } catch {
        failedCount += 1;
      }
    }
  };

  try {
    await walkAndClean(targetDir);
    return {
      success: true,
      deletedCount,
      skippedCount,
      failedCount,
      message: `Junk clean completed for ${targetDir}. Deleted ${deletedCount} file(s).`,
    };
  } catch (error) {
    console.error('Junk clean failed:', error);
    return {
      success: false,
      deletedCount,
      skippedCount,
      failedCount,
      message: 'Junk clean failed due to an unexpected error.',
    };
  }
}

function validatePowerShellCommand(command: string): { valid: boolean; reason?: string } {
  const trimmed = command.trim();

  if (!trimmed) {
    return { valid: false, reason: 'Command cannot be empty.' };
  }

  if (trimmed.length > 300) {
    return { valid: false, reason: 'Command is too long (max 300 chars).' };
  }

  if (/\r|\n|;|&&|\|\||\|/.test(trimmed)) {
    return {
      valid: false,
      reason: 'Chained or multiline commands are not allowed.',
    };
  }

  const dangerousPatterns = [
    /\bremove-item\b/i,
    /\bdel\b/i,
    /\berase\b/i,
    /\brmdir\b/i,
    /\bformat-volume\b/i,
    /\bclear-disk\b/i,
    /\bdiskpart\b/i,
    /\bshutdown\b/i,
    /\brestart-computer\b/i,
    /\bstop-computer\b/i,
    /\bset-itemproperty\b/i,
    /\bnew-itemproperty\b/i,
    /\bremove-itemproperty\b/i,
    /\breg\s+delete\b/i,
    /\bsc\s+delete\b/i,
    /\binvoke-expression\b/i,
    /\biex\b/i,
    /\bstart-process\b/i,
    />|<|>>/,
  ];

  if (dangerousPatterns.some((pattern) => pattern.test(trimmed))) {
    return {
      valid: false,
      reason: 'Command blocked by security policy.',
    };
  }

  return { valid: true };
}

async function executePowerShellCommand(command: string): Promise<PowerShellExecResult> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      message: 'PowerShell execution is only supported on Windows.',
    };
  }

  const validation = validatePowerShellCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      stdout: '',
      stderr: validation.reason || 'Command blocked.',
      exitCode: null,
      message: validation.reason || 'Command blocked.',
    };
  }

  // Escape double quotes so the command remains a single PowerShell -Command payload.
  const escapedCommand = command.replace(/"/g, '\\"');
  const shellCommand = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${escapedCommand}"`;

  return new Promise((resolve) => {
    exec(
      shellCommand,
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            stdout: String(stdout || '').trim(),
            stderr: String(stderr || error.message || '').trim(),
            exitCode: typeof error.code === 'number' ? error.code : null,
            message: 'PowerShell command failed.',
          });
          return;
        }

        resolve({
          success: true,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
          exitCode: 0,
          message: 'PowerShell command executed successfully.',
        });
      },
    );
  });
}

function getRegistryPath(hive: 'HKCU' | 'HKLM', key: string): string {
  return `${hive}${key}`;
}

function parseStartupApprovedStatus(value: string): 'enabled' | 'disabled' | 'unknown' {
  const hexMatches = value.match(/([0-9a-fA-F]{2})/g);
  if (!hexMatches || hexMatches.length === 0) {
    return 'unknown';
  }

  const firstByte = Number.parseInt(hexMatches[0], 16);
  if (firstByte === 0x02) {
    return 'enabled';
  }

  if (firstByte === 0x03) {
    return 'disabled';
  }

  return 'unknown';
}

interface RegistryQueryEntry {
  name: string;
  type: string;
  value: string;
}

async function queryRegistryValues(pathValue: string): Promise<RegistryQueryEntry[]> {
  return new Promise<RegistryQueryEntry[]>((resolve, reject) => {
    execFile('reg', ['query', pathValue], { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      const entries: RegistryQueryEntry[] = [];
      const lines = String(stdout || '').split(/\r?\n/);

      for (const line of lines) {
        // Example line:
        // "    OneDrive    REG_SZ    \"C:\\...\\OneDrive.exe\" /background"
        const match = line.match(/^\s{2,}(.+?)\s{2,}(REG_[A-Z0-9_]+)\s{2,}(.*)$/);
        if (!match) {
          continue;
        }

        const [, name, type, value] = match;
        entries.push({
          name: name.trim(),
          type: type.trim(),
          value: value.trim(),
        });
      }

      resolve(entries);
    });
  });
}

function validateStartupValueName(name: string): { valid: boolean; reason?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Startup value name is required.' };
  }

  if (trimmed.length > 200) {
    return { valid: false, reason: 'Startup value name is too long.' };
  }

  if (/\\|\/|\0/.test(trimmed)) {
    return { valid: false, reason: 'Invalid startup value name.' };
  }

  return { valid: true };
}

async function listStartupApps(): Promise<StartupAppEntry[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  const scopes: Array<{ hive: 'HKCU' | 'HKLM' }> = [{ hive: 'HKCU' }, { hive: 'HKLM' }];
  const entriesByScopeAndName = new Map<string, StartupAppEntry>();

  for (const scope of scopes) {
    const runPath = getRegistryPath(scope.hive, STARTUP_REG_KEY);
    const approvedPath = getRegistryPath(scope.hive, STARTUP_APPROVED_REG_KEY);

    let runItems: RegistryQueryEntry[] = [];
    let approvedItems: RegistryQueryEntry[] = [];

    try {
      runItems = await queryRegistryValues(runPath);
    } catch (error) {
      console.error(`Failed to read ${scope.hive} Run key:`, error);
    }

    try {
      approvedItems = await queryRegistryValues(approvedPath);
    } catch (error) {
      // StartupApproved may not exist on all systems/hives.
      console.warn(`${scope.hive} StartupApproved key unavailable:`, error);
    }

    for (const item of runItems) {
      if (!item.name) continue;
      const mapKey = `${scope.hive}:${item.name}`;
      entriesByScopeAndName.set(mapKey, {
        name: item.name,
        command: item.value,
        type: item.type,
        status: 'enabled',
        inRunKey: true,
        location: scope.hive,
      });
    }

    for (const approvedItem of approvedItems) {
      if (!approvedItem.name) continue;

      const approvedStatus = parseStartupApprovedStatus(approvedItem.value);
      const mapKey = `${scope.hive}:${approvedItem.name}`;
      const existing = entriesByScopeAndName.get(mapKey);

      if (existing && approvedStatus !== 'unknown') {
        existing.status = approvedStatus;
      }
    }
  }

  return [...entriesByScopeAndName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function removeStartupApp(name: string, location: 'HKCU' | 'HKLM'): Promise<StartupActionResult> {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Startup registry management is only supported on Windows.' };
  }

  const validation = validateStartupValueName(name);
  if (!validation.valid) {
    return { success: false, message: validation.reason || 'Invalid startup value name.' };
  }

  return new Promise<StartupActionResult>((resolve) => {
    execFile(
      'reg',
      ['delete', getRegistryPath(location, STARTUP_REG_KEY), '/v', name.trim(), '/f'],
      { windowsHide: true, timeout: 5000 },
      (err) => {
      if (err) {
        resolve({ success: false, message: `Failed to disable startup entry: ${name} (${location})` });
        return;
      }

      resolve({ success: true, message: `Startup entry disabled: ${name} (${location})` });
      },
    );
  });
}

// Get system stats
async function getSystemStats(): Promise<SystemStats> {
  try {
    const [cpuUtility, cpuSample, cpuData, memData, diskData] = await Promise.all([
      getWindowsCpuUtility(),
      sampleCpuUsage(),
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
    ]);

    const totalDisk = diskData.reduce((sum, disk) => sum + disk.size, 0);
    const usedDisk = diskData.reduce((sum, disk) => sum + disk.used, 0);

    // Task-Manager-like behavior: keep the strongest recent CPU signal.
    // Utility can be closest on Windows, while short-window samplers catch spikes.
    const cpuCandidates = [cpuUtility, cpuSample, cpuData.currentLoad].filter(
      (value): value is number => Number.isFinite(value),
    );
    const cpu = cpuCandidates.length > 0 ? round1(Math.max(...cpuCandidates)) : 0;

    return {
      cpu,
      cpuSources: {
        windowsUtility: cpuUtility,
        sampledDelta: round1(cpuSample),
        systemInformationLoad: round1(cpuData.currentLoad),
      },
      ram: {
        // Task Manager "Memory" aligns better with used/total than active/total.
        used: round1(memData.used / 1024 / 1024), // MB
        total: round1(memData.total / 1024 / 1024), // MB
        percentage: round1((memData.used / memData.total) * 100),
      },
      disk: {
        used: round1(usedDisk / 1024 / 1024 / 1024), // GB
        total: round1(totalDisk / 1024 / 1024 / 1024), // GB
        percentage: round1((usedDisk / totalDisk) * 100),
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
  const POLLING_INTERVAL = 1000; // 1 second

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
    // Monitoring is user-controlled from renderer via Start/Stop button.
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

ipcMain.handle('clean-junk', async () => {
  return cleanWindowsTempDirectory();
});

ipcMain.handle('execute-powershell', async (_event, command: string) => {
  try {
    return await executePowerShellCommand(command);
  } catch (error) {
    console.error('PowerShell execution error:', error);
    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown execution error.',
      exitCode: null,
      message: 'PowerShell command failed.',
    } as PowerShellExecResult;
  }
});

ipcMain.handle('get-startup-apps', async () => {
  try {
    return await listStartupApps();
  } catch (error) {
    console.error('Failed to read startup apps:', error);
    return [] as StartupAppEntry[];
  }
});

ipcMain.handle('remove-startup-app', async (_event, name: string, location: 'HKCU' | 'HKLM') => {
  try {
    return await removeStartupApp(name, location);
  } catch (error) {
    console.error('Failed to remove startup app:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to disable startup app.',
    } as StartupActionResult;
  }
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
