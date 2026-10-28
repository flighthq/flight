import type { LogData, LogEntry } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { createConsoleCaptureSink, createConsoleLogSink } from './consoleLogSink.ts';
import type { LogState } from './log.ts';
import { beginLogGroup, createLogState, log, setLogConsoleLevel, setLogSink } from './log.ts';

function entryOf(level: LogLevel, channel: string | null, data: LogData, timestampMs = 0): LogEntry {
  return { level, channel, data, timestampMs };
}

let state: LogState;

beforeEach(() => {
  state = createLogState();
  vi.restoreAllMocks();
});

describe('createConsoleCaptureSink', () => {
  it('records every level as a tagged JSON envelope on console.debug', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setLogConsoleLevel(state, LogLevel.None);
    setLogSink(state, createConsoleCaptureSink(state));
    log(state, 8, LogLevel.Verbose, { n: 1 }, 'batch');
    expect(debug).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse((debug.mock.calls[0] as string[])[0]);
    expect(parsed).toMatchObject({ __flight: true, t: 8, level: 'verbose', channel: 'batch', data: { n: 1 } });
  });

  it('also prints a human line only for levels at or above the console threshold', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogConsoleLevel(state, LogLevel.Info);
    setLogSink(state, createConsoleCaptureSink(state));
    log(state, 0, LogLevel.Info, 'shown');
    log(state, 0, LogLevel.Verbose, 'hidden');
    expect(info).toHaveBeenCalledTimes(1);
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('reads the console threshold from its state when each entry is written', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogSink(state, createConsoleCaptureSink(state));
    setLogConsoleLevel(state, LogLevel.Verbose);
    log(state, 0, LogLevel.Verbose, 'now shown');
    expect(consoleLog).toHaveBeenCalledTimes(1);
  });

  it('wraps a string payload as { msg } in the envelope', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setLogSink(state, createConsoleCaptureSink(state));
    log(state, 0, LogLevel.Error, 'boom');
    expect(JSON.parse((debug.mock.calls[0] as string[])[0]).data).toEqual({ msg: 'boom' });
  });

  it('accepts a custom formatter', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const customFormatter = vi.fn(() => 'custom-line');
    setLogSink(state, createConsoleCaptureSink(state, { formatter: customFormatter }));
    log(state, 0, LogLevel.Info, 'x');
    expect(customFormatter).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith('custom-line');
  });

  it('prints a channel prefix with structured human-readable data', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    setLogConsoleLevel(state, LogLevel.Info);
    setLogSink(state, createConsoleCaptureSink(state));

    log(state, 0, LogLevel.Info, { frame: 7 }, 'render');

    expect(info).toHaveBeenCalledWith('[render]', { frame: 7 });
  });

  it('does nothing when the console is unavailable', () => {
    const captureSink = createConsoleCaptureSink(state);
    const textSink = createConsoleLogSink(state);
    const originalConsole = globalThis.console;
    let threw = false;
    Object.defineProperty(globalThis, 'console', { configurable: true, value: undefined, writable: true });
    try {
      captureSink(entryOf(LogLevel.Info, null, 'capture'));
      textSink(entryOf(LogLevel.Info, null, 'text'));
    } catch {
      threw = true;
    } finally {
      Object.defineProperty(globalThis, 'console', {
        configurable: true,
        value: originalConsole,
        writable: true,
      });
    }

    expect(threw).toBe(false);
  });
});

describe('createConsoleLogSink', () => {
  it('writes the formatted entry to the console method matching its level', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = createConsoleLogSink(state, { formatter: () => 'formatted warning' });
    sink(entryOf(LogLevel.Warn, 'render', 'ignored'));
    expect(warn).toHaveBeenCalledWith('formatted warning');
  });

  it('uses a level-prefixed text formatter by default', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = createConsoleLogSink(state);

    sink(entryOf(LogLevel.Error, null, 'failed'));

    expect(error).toHaveBeenCalledWith('error [flight] failed');
  });

  it('routes None and Verbose to console.log', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sink = createConsoleLogSink(state, { formatter: () => 'line' });

    sink(entryOf(LogLevel.None, null, 'none'));
    sink(entryOf(LogLevel.Verbose, null, 'verbose'));

    expect(consoleLog).toHaveBeenCalledTimes(2);
  });

  it("formats over its state's group depth by default without indenting", () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    beginLogGroup(state, 0, 'open');
    createConsoleLogSink(state)(entryOf(LogLevel.Info, 'ch', 'grouped'));
    expect(info).toHaveBeenCalledWith('info [ch] grouped');
  });
});
