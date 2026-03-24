import React, { useState, useEffect } from 'react';
import './App.css';

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

export function App() {
  const [pingResult, setPingResult] = useState<string>('');
  const [messageInput, setMessageInput] = useState<string>('');
  const [messageResponse, setMessageResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // System monitoring state
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [statsHistory, setStatsHistory] = useState<SystemStats[]>([]);

  const handlePing = async () => {
    setIsLoading(true);
    try {
      const result = await window.api.ping();
      setPingResult(`Ping successful: ${result}`);
    } catch (error) {
      setPingResult(`Ping failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      window.api.sendMessage(messageInput);
      setMessageInput('');
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

  // Setup listener for message responses
  useEffect(() => {
    window.api.onMessageResponse((response) => {
      setMessageResponse(response);
    });
  }, []);

  // Setup system stats listener
  useEffect(() => {
    window.api.onSystemStats((stats) => {
      setSystemStats(stats);
      setStatsHistory((prev) => [...prev.slice(-59), stats]); // Keep last 60 samples (90 seconds at 1.5s intervals)
    });
  }, []);

  // Calculate average CPU usage from history
  const getAvgCpu = () => {
    if (statsHistory.length === 0) return 0;
    const sum = statsHistory.reduce((acc, stat) => acc + stat.cpu, 0);
    return Math.round((sum / statsHistory.length) * 10) / 10;
  };

  // Get color based on percentage
  const getColor = (percentage: number): string => {
    if (percentage < 50) return '#4CAF50'; // Green
    if (percentage < 80) return '#FFC107'; // Amber
    return '#F44336'; // Red
  };

  // Progress bar component
  const ProgressBar = ({ percentage, label }: { percentage: number; label: string }) => (
    <div className="stat-item">
      <div className="stat-label">
        <span>{label}</span>
        <span className="stat-value">{percentage}%</span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: getColor(percentage),
          }}
        ></div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>PC Optimizer</h1>
        <p>Real-time System Monitoring</p>
      </header>

      <main className="app-main">
        {/* System Monitoring Dashboard */}
        <section className="card monitoring-card">
          <div className="monitoring-header">
            <h2>System Monitor</h2>
            <button
              onClick={toggleMonitoring}
              className={`monitor-button ${monitoringActive ? 'active' : ''}`}
            >
              {monitoringActive ? '✓ Monitoring Active' : 'Start Monitoring'}
            </button>
          </div>

          {systemStats ? (
            <div className="stats-container">
              <div className="stat-group">
                <h3>CPU Usage</h3>
                <div className="cpu-stat">
                  <div className="cpu-percentage">{systemStats.cpu}%</div>
                  <div className="progress-bar large">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(systemStats.cpu, 100)}%`,
                        backgroundColor: getColor(systemStats.cpu),
                      }}
                    ></div>
                  </div>
                  {statsHistory.length > 1 && (
                    <p className="stat-info">Average: {getAvgCpu()}%</p>
                  )}
                </div>
              </div>

              <div className="stat-group">
                <h3>Memory (RAM)</h3>
                <ProgressBar percentage={systemStats.ram.percentage} label="RAM Usage" />
                <p className="stat-details">
                  {systemStats.ram.used.toFixed(1)} MB / {systemStats.ram.total.toFixed(1)} MB
                </p>
              </div>

              <div className="stat-group">
                <h3>Disk Storage</h3>
                <ProgressBar percentage={systemStats.disk.percentage} label="Disk Usage" />
                <p className="stat-details">
                  {systemStats.disk.used.toFixed(1)} GB / {systemStats.disk.total.toFixed(1)} GB
                </p>
              </div>

              <div className="stat-group timestamp">
                <p>Last updated: {new Date(systemStats.timestamp).toLocaleTimeString()}</p>
                <p>Samples collected: {statsHistory.length}</p>
              </div>
            </div>
          ) : (
            <div className="no-stats">
              <p>Start monitoring to see system statistics</p>
            </div>
          )}
        </section>

        {/* IPC Communication Test */}
        <section className="card">
          <h2>IPC Communication Test</h2>
          <div className="section">
            <h3>Ping-Pong Example</h3>
            <button onClick={handlePing} disabled={isLoading}>
              {isLoading ? 'Pinging...' : 'Send Ping'}
            </button>
            {pingResult && <p className="result">{pingResult}</p>}
          </div>

          <div className="section">
            <h3>Message Example</h3>
            <div className="input-group">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Enter a message..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button onClick={handleSendMessage}>Send Message</button>
            </div>
            {messageResponse && <p className="result">{messageResponse}</p>}
          </div>
        </section>

        <section className="card info">
          <h2>Features</h2>
          <ul>
            <li>✓ Real-time system monitoring (CPU, RAM, Disk)</li>
            <li>✓ Updates every 1.5 seconds</li>
            <li>✓ Non-blocking async operations</li>
            <li>✓ Context isolation enabled</li>
            <li>✓ IPC communication working</li>
            <li>✓ Production-ready structure</li>
          </ul>
        </section>
      </main>

      <footer className="app-footer">
        <p>Built with Electron + React + TypeScript + systeminformation</p>
      </footer>
    </div>
  );
}
