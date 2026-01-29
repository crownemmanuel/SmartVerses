import React, { useState, useEffect, useRef } from 'react';
import '../App.css';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  args?: any[];
}

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  useEffect(() => {
    // Capture console methods
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalDebug = console.debug;

    const addLog = (level: LogEntry['level'], ...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const entry: LogEntry = {
        id: logIdRef.current++,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        args,
      };

      setLogs(prev => [...prev, entry]);
    };

    console.log = (...args: any[]) => {
      originalLog(...args);
      addLog('log', ...args);
    };

    console.info = (...args: any[]) => {
      originalInfo(...args);
      addLog('info', ...args);
    };

    console.warn = (...args: any[]) => {
      originalWarn(...args);
      addLog('warn', ...args);
    };

    console.error = (...args: any[]) => {
      originalError(...args);
      addLog('error', ...args);
    };

    console.debug = (...args: any[]) => {
      originalDebug(...args);
      addLog('debug', ...args);
    };

    // Add initial log
    console.log('[LogViewer] Console logging captured. Developer mode enabled.');

    return () => {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
      console.debug = originalDebug;
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
    console.log('[LogViewer] Logs cleared');
  };

  const exportLogs = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartverses-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getLogLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'info': return '#3b82f6';
      case 'debug': return '#8b5cf6';
      default: return 'var(--text-color)';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Developer Logs</h2>
        <div style={styles.controls}>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All Levels</option>
            <option value="log">Log</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={styles.checkbox}
            />
            Auto-scroll
          </label>
          <button onClick={clearLogs} style={styles.button}>
            Clear
          </button>
          <button onClick={exportLogs} style={styles.button}>
            Export
          </button>
        </div>
      </div>
      <div style={styles.logContainer}>
        {filteredLogs.length === 0 ? (
          <div style={styles.emptyState}>
            {logs.length === 0 
              ? 'No logs yet. Console output will appear here.' 
              : 'No logs match your filter.'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} style={styles.logEntry}>
              <span style={styles.timestamp}>{log.timestamp}</span>
              <span
                style={{
                  ...styles.level,
                  color: getLogLevelColor(log.level),
                }}
              >
                [{log.level.toUpperCase()}]
              </span>
              <span style={styles.message}>{log.message}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
      <div style={styles.footer}>
        <span style={styles.footerText}>
          Showing {filteredLogs.length} of {logs.length} logs
        </span>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--app-bg-color)',
    color: 'var(--text-color)',
  },
  header: {
    padding: 'var(--spacing-4)',
    borderBottom: '1px solid var(--app-border-color)',
    backgroundColor: 'var(--app-bg-color)',
  },
  title: {
    margin: '0 0 var(--spacing-3) 0',
    fontSize: '20px',
    fontWeight: 600,
  },
  controls: {
    display: 'flex',
    gap: 'var(--spacing-2)',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchInput: {
    flex: 1,
    minWidth: '200px',
    padding: 'var(--spacing-2) var(--spacing-3)',
    borderRadius: '6px',
    border: '1px solid var(--app-border-color)',
    backgroundColor: 'var(--input-bg-color)',
    color: 'var(--text-color)',
    fontSize: '14px',
  },
  filterSelect: {
    padding: 'var(--spacing-2) var(--spacing-3)',
    borderRadius: '6px',
    border: '1px solid var(--app-border-color)',
    backgroundColor: 'var(--input-bg-color)',
    color: 'var(--text-color)',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-1)',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
  },
  button: {
    padding: 'var(--spacing-2) var(--spacing-4)',
    borderRadius: '6px',
    border: '1px solid var(--app-border-color)',
    backgroundColor: 'var(--button-bg-color)',
    color: 'var(--button-text-color)',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  logContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--spacing-2)',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  logEntry: {
    display: 'flex',
    gap: 'var(--spacing-2)',
    padding: 'var(--spacing-1) var(--spacing-2)',
    marginBottom: '2px',
    wordBreak: 'break-word',
  },
  timestamp: {
    color: 'var(--text-secondary-color)',
    minWidth: '80px',
    flexShrink: 0,
  },
  level: {
    minWidth: '70px',
    flexShrink: 0,
    fontWeight: 600,
  },
  message: {
    flex: 1,
    color: 'var(--text-color)',
    whiteSpace: 'pre-wrap',
  },
  emptyState: {
    padding: 'var(--spacing-6)',
    textAlign: 'center',
    color: 'var(--text-secondary-color)',
  },
  footer: {
    padding: 'var(--spacing-2) var(--spacing-4)',
    borderTop: '1px solid var(--app-border-color)',
    backgroundColor: 'var(--app-bg-color)',
  },
  footerText: {
    fontSize: '12px',
    color: 'var(--text-secondary-color)',
  },
};

export default LogViewer;
