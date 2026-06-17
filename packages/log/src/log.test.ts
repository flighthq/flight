import type { FlightLogEntry } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import {
  createConsoleCaptureSink,
  flightLog,
  getFlightLogConsoleLevel,
  logDebug,
  logError,
  logInfo,
  logVerbose,
  logWarn,
  setFlightLogConsoleLevel,
  setFlightLogSink,
} from './log';

function recordingSink(): { entries: FlightLogEntry[] } {
  const entries: FlightLogEntry[] = [];
  setFlightLogSink((entry) => entries.push({ ...entry }));
  return { entries };
}

beforeEach(() => {
  setFlightLogSink(null);
  setFlightLogConsoleLevel(LogLevel.Info);
  vi.restoreAllMocks();
});

describe('createConsoleCaptureSink', () => {
  it('records every level as a tagged JSON envelope on console.debug', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setFlightLogConsoleLevel(LogLevel.None);
    setFlightLogSink(createConsoleCaptureSink());
    flightLog(LogLevel.Verbose, { n: 1 }, 'batch');
    expect(debug).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse((debug.mock.calls[0] as string[])[0]);
    expect(parsed).toMatchObject({ __flight: true, level: 'verbose', channel: 'batch', data: { n: 1 } });
  });

  it('also prints a human line only for levels at or above the console threshold', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    setFlightLogConsoleLevel(LogLevel.Info);
    setFlightLogSink(createConsoleCaptureSink());
    flightLog(LogLevel.Info, 'shown');
    flightLog(LogLevel.Verbose, 'hidden');
    expect(info).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled(); // Verbose uses console.log and is above the threshold
  });

  it('wraps a string payload as { msg } in the envelope', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setFlightLogSink(createConsoleCaptureSink());
    flightLog(LogLevel.Error, 'boom');
    expect(JSON.parse((debug.mock.calls[0] as string[])[0]).data).toEqual({ msg: 'boom' });
  });
});

describe('flightLog', () => {
  it('forwards level, channel, and data to the sink', () => {
    const { entries } = recordingSink();
    flightLog(LogLevel.Warn, { k: 1 }, 'shader');
    expect(entries[0]).toEqual({ level: LogLevel.Warn, channel: 'shader', data: { k: 1 } });
  });

  it('defaults the channel to null', () => {
    const { entries } = recordingSink();
    flightLog(LogLevel.Info, 'x');
    expect(entries[0].channel).toBeNull();
  });

  it('does nothing when no sink is installed', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(() => flightLog(LogLevel.Info, 'x')).not.toThrow();
    expect(debug).not.toHaveBeenCalled();
  });
});

describe('getFlightLogConsoleLevel', () => {
  it('returns the current threshold', () => {
    setFlightLogConsoleLevel(LogLevel.Verbose);
    expect(getFlightLogConsoleLevel()).toBe(LogLevel.Verbose);
  });
});

describe('logDebug', () => {
  it('emits at LogLevel.Debug', () => {
    const { entries } = recordingSink();
    logDebug('d', 'chan');
    expect(entries[0]).toEqual({ level: LogLevel.Debug, channel: 'chan', data: 'd' });
  });
});

describe('logError', () => {
  it('emits at LogLevel.Error', () => {
    const { entries } = recordingSink();
    logError('e');
    expect(entries[0].level).toBe(LogLevel.Error);
  });
});

describe('logInfo', () => {
  it('emits at LogLevel.Info', () => {
    const { entries } = recordingSink();
    logInfo('i');
    expect(entries[0].level).toBe(LogLevel.Info);
  });
});

describe('logVerbose', () => {
  it('emits at LogLevel.Verbose', () => {
    const { entries } = recordingSink();
    logVerbose('v');
    expect(entries[0].level).toBe(LogLevel.Verbose);
  });
});

describe('logWarn', () => {
  it('emits at LogLevel.Warn', () => {
    const { entries } = recordingSink();
    logWarn('w');
    expect(entries[0].level).toBe(LogLevel.Warn);
  });
});

describe('setFlightLogConsoleLevel', () => {
  it('raises the threshold so finer levels print a human line', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    setFlightLogConsoleLevel(LogLevel.Verbose);
    setFlightLogSink(createConsoleCaptureSink());
    flightLog(LogLevel.Verbose, 'now shown');
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('setFlightLogSink', () => {
  it('clears the sink when passed null', () => {
    const { entries } = recordingSink();
    setFlightLogSink(null);
    flightLog(LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });
});
