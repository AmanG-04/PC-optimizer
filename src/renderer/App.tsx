import React, { useEffect, useMemo, useState } from 'react';

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

type NavView = 'dashboard' | 'cleaner' | 'startup' | 'terminal';
type StartupFilter = 'all' | 'enabled' | 'disabled';

const navItems: Array<{ key: NavView; label: string; short: string }> = [
  { key: 'dashboard', label: 'Dashboard', short: 'DB' },
  { key: 'cleaner', label: 'Cleaner', short: 'CL' },
  { key: 'startup', label: 'Startup', short: 'SU' },
  { key: 'terminal', label: 'Terminal', short: 'TM' },
];

export function App() {
  const [activeView, setActiveView] = useState<NavView>('dashboard');
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [statsHistory, setStatsHistory] = useState<SystemStats[]>([]);
  const [isCleaningJunk, setIsCleaningJunk] = useState(false);
  const [junkResult, setJunkResult] = useState<CleanJunkResult | null>(null);
  const [junkError, setJunkError] = useState<string>('');
  const [psCommand, setPsCommand] = useState('Get-Process');
  const [isExecutingPs, setIsExecutingPs] = useState(false);
  const [psResult, setPsResult] = useState<PowerShellExecResult | null>(null);
  const [psError, setPsError] = useState('');
  const [startupApps, setStartupApps] = useState<StartupAppEntry[]>([]);
  const [isLoadingStartup, setIsLoadingStartup] = useState(false);
  const [startupStatus, setStartupStatus] = useState<StartupActionResult | null>(null);
  const [startupFilter, setStartupFilter] = useState<StartupFilter>('all');

  const loadStartupApps = async () => {
    setIsLoadingStartup(true);
    try {
      const apps = await window.api.getStartupApps();
      setStartupApps(apps);
    } finally {
      setIsLoadingStartup(false);
    }
  };

  const toggleMonitoring = () => {
    if (monitoringActive) {
      window.api.stopMonitoring();
      setMonitoringActive(false);
    } else {
      window.api.startMonitoring();
      setMonitoringActive(true);
    }
  };

  const handleCleanJunk = async () => {
    const confirmed = window.confirm(
      'Clean junk files only from C:\\Users\\Aman\\Desktop\\junk? In-use and protected files will be skipped.',
    );

    if (!confirmed) {
      return;
    }

    setIsCleaningJunk(true);
    setJunkError('');
    setJunkResult(null);

    try {
      const result = await window.api.cleanJunk();
      setJunkResult(result);
      if (!result.success) {
        setJunkError(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clean junk files.';
      setJunkError(message);
    } finally {
      setIsCleaningJunk(false);
    }
  };

  const handleExecutePowerShell = async () => {
    const command = psCommand.trim();
    if (!command) {
      setPsError('Please enter a PowerShell command.');
      setPsResult(null);
      return;
    }

    setIsExecutingPs(true);
    setPsError('');
    setPsResult(null);

    try {
      const result = await window.api.executePowerShell(command);
      setPsResult(result);
      if (!result.success) {
        setPsError(result.stderr || result.message || 'Command failed.');
      }
    } catch (error) {
      setPsError(error instanceof Error ? error.message : 'Execution failed.');
    } finally {
      setIsExecutingPs(false);
    }
  };

  useEffect(() => {
    window.api.onSystemStats((stats) => {
      setSystemStats(stats);
      setStatsHistory((prev) => [...prev.slice(-59), stats]);
    });
  }, []);

  useEffect(() => {
    if (activeView === 'startup') {
      loadStartupApps();
    }
  }, [activeView]);

  const handleDisableStartupApp = async (name: string, location: 'HKCU' | 'HKLM') => {
    const confirmed = window.confirm(`Disable startup entry "${name}" from ${location}?`);
    if (!confirmed) {
      return;
    }

    const result = await window.api.removeStartupApp(name, location);
    setStartupStatus(result);
    await loadStartupApps();
  };

  const filteredStartupApps = useMemo(() => {
    if (startupFilter === 'all') return startupApps;
    if (startupFilter === 'enabled') return startupApps.filter((entry) => entry.status === 'enabled');
    return startupApps.filter((entry) => entry.status === 'disabled');
  }, [startupApps, startupFilter]);

  const getAvgCpu = () => {
    if (statsHistory.length === 0) return 0;
    const sum = statsHistory.reduce((acc, stat) => acc + stat.cpu, 0);
    return Math.round((sum / statsHistory.length) * 10) / 10;
  };

  const getColor = (percentage: number): string => {
    if (percentage < 50) return 'bg-emerald-500';
    if (percentage < 80) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const cpuChartPoints = useMemo(() => statsHistory.slice(-24).map((item) => item.cpu), [statsHistory]);

  const StatCard = ({ title, value, detail }: { title: string; value: number; detail: string }) => (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-[0_8px_40px_rgba(8,15,35,0.55)] transition hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900">
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-100">{value.toFixed(1)}%</p>
      <div className="mt-4 h-2 w-full rounded-full bg-slate-800/90">
        <div className={`h-2 rounded-full ${getColor(value)}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <p className="mt-3 text-xs text-slate-400">{detail}</p>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute -top-44 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/4 -right-32 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative flex min-h-screen flex-col md:flex-row">
        <aside className="border-b border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-950/95 px-5 py-6 md:w-72 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/90 text-sm font-bold text-slate-950">PC</div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">PC Optimizer</h1>
              <p className="mt-0.5 text-xs text-slate-400">Clean, monitor, and manage</p>
            </div>
          </div>

          <nav className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                  activeView === item.key
                    ? 'bg-slate-100 text-slate-900 shadow'
                    : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-700/80 text-[10px] font-semibold text-slate-200">
                  {item.short}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-slate-800/70 bg-slate-900/60 p-3 text-xs text-slate-400">
            Live mode: {monitoringActive ? 'Monitoring On' : 'Monitoring Off'}
          </div>
        </aside>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
          {activeView === 'dashboard' && (
            <section className="space-y-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-900/90 to-slate-900/60 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
                  <p className="text-sm text-slate-400">Real-time resource overview</p>
                </div>
                <button
                  type="button"
                  onClick={toggleMonitoring}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                    monitoringActive
                      ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
                      : 'bg-slate-100 text-slate-900 hover:bg-white'
                  }`}
                >
                  {monitoringActive ? 'Monitoring Active' : 'Start Monitoring'}
                </button>
              </div>

              {!systemStats && (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center text-slate-400">
                  Start monitoring to populate stats.
                </div>
              )}

              {systemStats && (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard
                      title="CPU"
                      value={systemStats.cpu}
                      detail={`Avg ${getAvgCpu().toFixed(1)}% · Updated ${new Date(systemStats.timestamp).toLocaleTimeString()}`}
                    />
                    <StatCard
                      title="Memory"
                      value={systemStats.ram.percentage}
                      detail={`${systemStats.ram.used.toFixed(0)} MB / ${systemStats.ram.total.toFixed(0)} MB`}
                    />
                    <StatCard
                      title="Disk"
                      value={systemStats.disk.percentage}
                      detail={`${systemStats.disk.used.toFixed(1)} GB / ${systemStats.disk.total.toFixed(1)} GB`}
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-[0_8px_40px_rgba(8,15,35,0.45)]">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-300">CPU Trend</p>
                      <span className="rounded-full border border-slate-700/80 bg-slate-900 px-2.5 py-0.5 text-xs text-slate-400">
                        last 24 samples
                      </span>
                    </div>
                    <div className="mt-4 flex h-28 items-end gap-1 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
                      {cpuChartPoints.map((point, index) => (
                        <div
                          key={`${point}-${index}`}
                          className={`flex-1 rounded-sm ${getColor(point)}`}
                          style={{ height: `${Math.max(4, (point / 100) * 100)}%` }}
                          title={`${point.toFixed(1)}%`}
                        />
                      ))}
                    </div>
                    {systemStats.cpuSources && (
                      <p className="mt-4 text-xs text-slate-500">
                        Utility: {systemStats.cpuSources.windowsUtility ?? 'n/a'}% · Delta:{' '}
                        {systemStats.cpuSources.sampledDelta}% · SI:{' '}
                        {systemStats.cpuSources.systemInformationLoad}%
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {activeView === 'cleaner' && (
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_8px_40px_rgba(8,15,35,0.45)]">
              <h2 className="text-2xl font-semibold tracking-tight">Cleaner</h2>
              <p className="mt-1 text-sm text-slate-400">Target: C:\Users\Aman\Desktop\junk</p>
              <button
                type="button"
                onClick={handleCleanJunk}
                disabled={isCleaningJunk}
                className="mt-5 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isCleaningJunk ? 'Cleaning...' : 'Clean Junk'}
              </button>

              {junkResult && (
                <p className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
                  {junkResult.message} Skipped: {junkResult.skippedCount}, Failed: {junkResult.failedCount}
                </p>
              )}

              {junkError && (
                <p className="mt-4 rounded-xl border border-rose-900/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
                  {junkError}
                </p>
              )}
            </section>
          )}

          {activeView === 'startup' && (
            <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_8px_40px_rgba(8,15,35,0.45)]">
              <h2 className="text-2xl font-semibold tracking-tight">Startup</h2>
              <p className="text-sm text-slate-400">From HKCU\Software\Microsoft\Windows\CurrentVersion\Run</p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadStartupApps}
                  disabled={isLoadingStartup}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoadingStartup ? 'Refreshing...' : 'Refresh'}
                </button>

                <div className="ml-auto flex gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
                  {(['all', 'enabled', 'disabled'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setStartupFilter(filter)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        startupFilter === filter
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {filter[0].toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {startupStatus && (
                <p
                  className={`rounded-xl px-3 py-2 text-sm ${
                    startupStatus.success
                      ? 'border border-emerald-900/40 bg-emerald-950/40 text-emerald-300'
                      : 'border border-rose-900/40 bg-rose-950/40 text-rose-300'
                  }`}
                >
                  {startupStatus.message}
                </p>
              )}

              <div className="space-y-2">
                {filteredStartupApps.length === 0 && !isLoadingStartup && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                    No startup entries found.
                  </div>
                )}

                {filteredStartupApps.map((appEntry) => (
                  <div key={appEntry.name} className="rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{appEntry.name}</p>
                        <p className="text-xs text-slate-500">{appEntry.type} · {appEntry.location}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            appEntry.status === 'enabled'
                              ? 'border border-emerald-900/40 bg-emerald-950/40 text-emerald-300'
                              : appEntry.status === 'disabled'
                                ? 'border border-amber-900/40 bg-amber-950/40 text-amber-300'
                                : 'border border-slate-700 bg-slate-800 text-slate-300'
                          }`}
                        >
                          {appEntry.status.toUpperCase()}
                        </span>
                        {appEntry.inRunKey && appEntry.status !== 'disabled' && (
                          <button
                            type="button"
                            onClick={() => handleDisableStartupApp(appEntry.name, appEntry.location)}
                            className="rounded-lg border border-rose-900/40 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/40"
                          >
                            Disable / Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 break-all text-xs text-slate-400">{appEntry.command}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeView === 'terminal' && (
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_8px_40px_rgba(8,15,35,0.45)]">
              <h2 className="text-2xl font-semibold tracking-tight">Terminal</h2>
              <p className="mt-1 text-sm text-slate-400">Dangerous or chained commands are blocked.</p>

              <div className="mt-4 flex flex-col gap-2 md:flex-row">
                <input
                  type="text"
                  value={psCommand}
                  onChange={(e) => setPsCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExecutePowerShell()}
                  placeholder="Enter PowerShell command"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
                />
                <button
                  type="button"
                  onClick={handleExecutePowerShell}
                  disabled={isExecutingPs}
                  className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isExecutingPs ? 'Executing...' : 'Execute'}
                </button>
              </div>

              {psResult && (
                <>
                  <p
                    className={`mt-4 rounded-xl px-3 py-2 text-sm ${
                      psResult.success
                        ? 'border border-emerald-900/40 bg-emerald-950/40 text-emerald-300'
                        : 'border border-rose-900/40 bg-rose-950/40 text-rose-300'
                    }`}
                  >
                    {psResult.message}
                  </p>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-800 bg-black/60 p-4 text-xs text-slate-200">
                    {psResult.stdout || psResult.stderr || 'No output returned.'}
                  </pre>
                </>
              )}

              {psError && !psResult && (
                <p className="mt-4 rounded-xl border border-rose-900/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
                  {psError}
                </p>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
