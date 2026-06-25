import type { LogEntry } from './Log';
import type { Signal } from './Signal';

// Log emission event entity. Enable delivery with enableLogSignals; the signals stay inert until
// then. onLogEntry fires for every emitted entry; onLogError fires only for Error-level entries.
export interface LogSignals {
  onLogEntry: Signal<(entry: Readonly<LogEntry>) => void>;
  onLogError: Signal<(entry: Readonly<LogEntry>) => void>;
}
