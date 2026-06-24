import { connectSignal } from '@flighthq/signals';
import type { LogEntry, LogSignals } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import {
  addLogSink,
  beginLogGroup,
  clearLogChannelLevels,
  clearLogGroups,
  clearLogRedactionPaths,
  clearLogSerializers,
  clearLogSinks,
  clearMemoryLogSink,
  createBufferedLogSink,
  createChildLogContext,
  createConsoleCaptureSink,
  createFanoutLogSink,
  createFileLogSink,
  createFilterLogSink,
  createJsonLogFormatter,
  createLogContext,
  createLogSpan,
  createMemoryLogSink,
  createRateLimitedLogSink,
  createSampledLogSink,
  createTextLogFormatter,
  createWebLogTransportBackend,
  disposeFileLogSink,
  disposeLogSink,
  enableLogSignals,
  endLogGroup,
  endLogTimer,
  enterLogSpan,
  exitLogSpan,
  flushLogSink,
  getLogChannelLevel,
  getLogConsoleLevel,
  getLogLevel,
  getLogLevelName,
  getLogTransportBackend,
  getMemoryLogSinkEntries,
  log,
  logAssert,
  logDebug,
  logDebugWith,
  logError,
  logErrorWith,
  logInfo,
  logInfoWith,
  logOnce,
  logVerbose,
  logVerboseWith,
  logWarn,
  logWarnWith,
  logWith,
  parseLogLevel,
  registerLogSerializer,
  removeLogSink,
  serializeLogError,
  setLogChannelLevel,
  setLogConsoleLevel,
  setLogLevel,
  setLogRedactionPaths,
  setLogSink,
  setLogTransportBackend,
  startLogTimer,
} from './log';

function recordingSink(): { entries: LogEntry[]; sink: (entry: LogEntry) => void } {
  const entries: LogEntry[] = [];
  const sink = (entry: Readonly<LogEntry>): void => {
    entries.push({ ...entry });
  };
  addLogSink(sink);
  return { entries, sink };
}

beforeEach(() => {
  clearLogGroups();
  clearLogRedactionPaths();
  clearLogSerializers();
  clearLogSinks();
  clearLogChannelLevels();
  setLogConsoleLevel(LogLevel.Info);
  setLogLevel(LogLevel.Verbose);
  setLogTransportBackend(null);
  vi.restoreAllMocks();
});

describe('addLogSink', () => {
  it('adds a sink that receives emitted entries', () => {
    const entries: LogEntry[] = [];
    addLogSink((e) => entries.push({ ...e }));
    log(LogLevel.Info, 'hello');
    expect(entries).toHaveLength(1);
  });

  it('does not add the same sink twice', () => {
    const entries: LogEntry[] = [];
    const sink = (e: Readonly<LogEntry>): void => {
      entries.push({ ...e });
    };
    addLogSink(sink);
    addLogSink(sink);
    log(LogLevel.Info, 'x');
    expect(entries).toHaveLength(1);
  });
});

describe('beginLogGroup', () => {
  afterEach(() => clearLogGroups());

  it('emits a Debug group-begin entry and increments nesting depth', () => {
    const { entries } = recordingSink();
    beginLogGroup('setup');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Debug);
    expect(entries[0].data).toMatchObject({ group: 'begin', depth: 1 });
  });

  it('nests: second beginLogGroup produces depth 2', () => {
    const { entries } = recordingSink();
    beginLogGroup('outer');
    beginLogGroup('inner');
    expect(entries[1].data).toMatchObject({ depth: 2 });
  });
});

describe('clearLogChannelLevels', () => {
  it('removes all per-channel level overrides', () => {
    setLogChannelLevel('render', LogLevel.Error);
    clearLogChannelLevels();
    expect(getLogChannelLevel('render')).toBeNull();
  });
});

describe('clearLogGroups', () => {
  afterEach(() => clearLogGroups());

  it('resets group nesting depth to zero without emitting', () => {
    const { entries } = recordingSink();
    beginLogGroup('a');
    beginLogGroup('b');
    entries.length = 0;
    clearLogGroups();
    // After clearLogGroups, endLogGroup should be a no-op (depth is 0)
    endLogGroup();
    expect(entries).toHaveLength(0);
  });
});

describe('clearLogRedactionPaths', () => {
  it('removes all redaction paths so fields are no longer redacted', () => {
    setLogRedactionPaths(['token']);
    clearLogRedactionPaths();
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: { token: 'secret' } };
    const result = JSON.parse(fmt(entry));
    expect(result.data.token).toBe('secret');
  });
});

describe('clearLogSerializers', () => {
  it('removes all serializer registrations', () => {
    registerLogSerializer('acme.Foo', () => ({ serialized: true }));
    clearLogSerializers();
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: { obj: { __kind: 'acme.Foo', x: 1 } } };
    const result = JSON.parse(fmt(entry));
    // Without serializer the value should pass through as-is
    expect(result.data.obj.__kind).toBe('acme.Foo');
  });
});

describe('clearLogSinks', () => {
  it('removes all sinks so subsequent emit calls are no-ops', () => {
    const entries: LogEntry[] = [];
    addLogSink((e) => entries.push({ ...e }));
    clearLogSinks();
    log(LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });
});

describe('clearMemoryLogSink', () => {
  it('empties the captured entries', () => {
    const handle = createMemoryLogSink(10);
    addLogSink(handle.sink);
    log(LogLevel.Info, 'a');
    clearMemoryLogSink(handle);
    expect(getMemoryLogSinkEntries(handle)).toHaveLength(0);
  });
});

describe('createBufferedLogSink', () => {
  it('does not forward entries until flushed', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100, intervalMs: 0 });
    addLogSink(handle.sink);
    log(LogLevel.Info, 'queued');
    expect(forwarded).toHaveLength(0);
    flushLogSink(handle);
    expect(forwarded).toHaveLength(1);
  });

  it('auto-flushes when buffer reaches size', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 2, intervalMs: 0 });
    addLogSink(handle.sink);
    log(LogLevel.Info, 'a');
    log(LogLevel.Info, 'b');
    expect(forwarded).toHaveLength(2);
  });

  it('disposeLogSink flushes and stops future auto-flush', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100, intervalMs: 0 });
    addLogSink(handle.sink);
    log(LogLevel.Info, 'pending');
    disposeLogSink(handle);
    expect(forwarded).toHaveLength(1);
  });
});

describe('createChildLogContext', () => {
  it('merges parent and child fields (child wins)', () => {
    const parent = createLogContext('chan', { a: 1, b: 2 });
    const child = createChildLogContext(parent, { b: 99, c: 3 });
    expect(child.fields).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('inherits parent channel when no override given', () => {
    const parent = createLogContext('parent', {});
    const child = createChildLogContext(parent, {});
    expect(child.channel).toBe('parent');
  });

  it('overrides channel when provided', () => {
    const parent = createLogContext('parent', {});
    const child = createChildLogContext(parent, {}, 'child');
    expect(child.channel).toBe('child');
  });
});

describe('createConsoleCaptureSink', () => {
  it('records every level as a tagged JSON envelope on console.debug', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setLogConsoleLevel(LogLevel.None);
    setLogSink(createConsoleCaptureSink());
    log(LogLevel.Verbose, { n: 1 }, 'batch');
    expect(debug).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse((debug.mock.calls[0] as string[])[0]);
    expect(parsed).toMatchObject({ __flight: true, level: 'verbose', channel: 'batch', data: { n: 1 } });
  });

  it('also prints a human line only for levels at or above the console threshold', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogConsoleLevel(LogLevel.Info);
    setLogSink(createConsoleCaptureSink());
    log(LogLevel.Info, 'shown');
    log(LogLevel.Verbose, 'hidden');
    expect(info).toHaveBeenCalledTimes(1);
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('wraps a string payload as { msg } in the envelope', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setLogSink(createConsoleCaptureSink());
    log(LogLevel.Error, 'boom');
    expect(JSON.parse((debug.mock.calls[0] as string[])[0]).data).toEqual({ msg: 'boom' });
  });

  it('accepts a custom formatter', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const customFormatter = vi.fn(() => 'custom-line');
    setLogSink(createConsoleCaptureSink({ formatter: customFormatter }));
    log(LogLevel.Info, 'x');
    expect(customFormatter).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith('custom-line');
  });
});

describe('createFanoutLogSink', () => {
  it('forwards each entry to all component sinks', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    const fanout = createFanoutLogSink(
      (e) => a.push({ ...e }),
      (e) => b.push({ ...e }),
    );
    addLogSink(fanout);
    log(LogLevel.Info, 'hello');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe('createFileLogSink', () => {
  it('writes formatted lines to the installed transport backend', () => {
    const lines: string[] = [];
    setLogTransportBackend({ write: (line) => lines.push(line) });
    const handle = createFileLogSink();
    addLogSink(handle.sink);
    log(LogLevel.Info, 'file-entry');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ __flight: true, level: 'info', data: { msg: 'file-entry' } });
  });

  it('is a no-op when no transport backend is set', () => {
    const handle = createFileLogSink();
    addLogSink(handle.sink);
    // Should not throw with no backend
    expect(() => log(LogLevel.Info, 'no-backend')).not.toThrow();
  });

  it('accepts a custom formatter', () => {
    const lines: string[] = [];
    setLogTransportBackend({ write: (line) => lines.push(line) });
    const handle = createFileLogSink({ formatter: () => 'custom' });
    addLogSink(handle.sink);
    log(LogLevel.Info, 'x');
    expect(lines[0]).toBe('custom\n');
  });
});

describe('createFilterLogSink', () => {
  it('only forwards entries matching the predicate', () => {
    const entries: LogEntry[] = [];
    const filtered = createFilterLogSink(
      (e) => entries.push({ ...e }),
      (e) => e.level === LogLevel.Error,
    );
    addLogSink(filtered);
    log(LogLevel.Info, 'skip');
    log(LogLevel.Error, 'keep');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Error);
  });
});

describe('createJsonLogFormatter', () => {
  it('produces a __flight JSON envelope', () => {
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = { level: LogLevel.Info, channel: 'test', data: 'msg' };
    const result = JSON.parse(fmt(entry));
    expect(result).toMatchObject({ __flight: true, level: 'info', channel: 'test', data: { msg: 'msg' } });
  });

  it('applies registered serializers to values with matching __kind', () => {
    registerLogSerializer('acme.Widget', (v) => ({ serialized: true, id: (v as { id: number }).id }));
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = {
      level: LogLevel.Info,
      channel: null,
      data: { widget: { __kind: 'acme.Widget', id: 42 } },
    };
    const result = JSON.parse(fmt(entry));
    expect(result.data.widget).toEqual({ serialized: true, id: 42 });
  });

  it('applies redaction paths to nested fields', () => {
    setLogRedactionPaths(['credentials.token', 'password']);
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = {
      level: LogLevel.Info,
      channel: null,
      data: { credentials: { token: 'secret', user: 'alice' }, password: 'pw' },
    };
    const result = JSON.parse(fmt(entry));
    expect(result.data.credentials.token).toBe('[REDACTED]');
    expect(result.data.credentials.user).toBe('alice');
    expect(result.data.password).toBe('[REDACTED]');
  });
});

describe('createLogContext', () => {
  it('creates a context with the given channel and fields', () => {
    const ctx = createLogContext('render', { version: 1 });
    expect(ctx.channel).toBe('render');
    expect(ctx.fields).toEqual({ version: 1 });
  });

  it('defaults fields to empty object', () => {
    const ctx = createLogContext('ch');
    expect(ctx.fields).toEqual({});
  });
});

describe('createLogSpan', () => {
  it('creates a LogSpan plain value with the given name, fields, and channel', () => {
    const span = createLogSpan('render-frame', { frame: 1 }, 'perf');
    expect(span.name).toBe('render-frame');
    expect(span.fields).toEqual({ frame: 1 });
    expect(span.channel).toBe('perf');
  });

  it('defaults fields to empty object and channel to null', () => {
    const span = createLogSpan('op');
    expect(span.fields).toEqual({});
    expect(span.channel).toBeNull();
  });
});

describe('createMemoryLogSink', () => {
  it('captures entries up to capacity', () => {
    const handle = createMemoryLogSink(3);
    addLogSink(handle.sink);
    log(LogLevel.Info, 'a');
    log(LogLevel.Info, 'b');
    log(LogLevel.Info, 'c');
    expect(getMemoryLogSinkEntries(handle)).toHaveLength(3);
  });

  it('overwrites oldest entries when capacity is exceeded (ring buffer)', () => {
    const handle = createMemoryLogSink(2);
    addLogSink(handle.sink);
    log(LogLevel.Info, 'first');
    log(LogLevel.Info, 'second');
    log(LogLevel.Info, 'third');
    const entries = getMemoryLogSinkEntries(handle);
    expect(entries).toHaveLength(2);
    expect(entries[0].data).toBe('second');
    expect(entries[1].data).toBe('third');
  });

  it('returns entries oldest-first after capacity exceeded', () => {
    const handle = createMemoryLogSink(3);
    addLogSink(handle.sink);
    for (let i = 0; i < 5; i++) log(LogLevel.Info, `msg${i}`);
    const entries = getMemoryLogSinkEntries(handle);
    expect(entries.map((e) => e.data)).toEqual(['msg2', 'msg3', 'msg4']);
  });
});

describe('createRateLimitedLogSink', () => {
  it('limits entries per interval', () => {
    const forwarded: LogEntry[] = [];
    const handle = createRateLimitedLogSink((e) => forwarded.push({ ...e }), { maxPerInterval: 2, intervalMs: 10000 });
    addLogSink(handle.sink);
    log(LogLevel.Info, 'a');
    log(LogLevel.Info, 'b');
    log(LogLevel.Info, 'c'); // should be rate-limited
    expect(forwarded).toHaveLength(2);
  });

  it('tracks per-channel when perChannel is true', () => {
    const forwarded: LogEntry[] = [];
    const handle = createRateLimitedLogSink((e) => forwarded.push({ ...e }), {
      perChannel: true,
      maxPerInterval: 1,
      intervalMs: 10000,
    });
    addLogSink(handle.sink);
    log(LogLevel.Info, 'a', 'ch1');
    log(LogLevel.Info, 'b', 'ch1'); // rate-limited for ch1
    log(LogLevel.Info, 'c', 'ch2'); // allowed — different channel
    expect(forwarded).toHaveLength(2);
    expect(forwarded[0].channel).toBe('ch1');
    expect(forwarded[1].channel).toBe('ch2');
  });
});

describe('createSampledLogSink', () => {
  it('forwards 1-in-N entries', () => {
    const forwarded: LogEntry[] = [];
    const sampled = createSampledLogSink((e) => forwarded.push({ ...e }), 3);
    addLogSink(sampled);
    for (let i = 0; i < 9; i++) log(LogLevel.Info, `msg${i}`);
    expect(forwarded).toHaveLength(3);
  });

  it('passes all entries through when rate is 1', () => {
    const forwarded: LogEntry[] = [];
    const sampled = createSampledLogSink((e) => forwarded.push({ ...e }), 1);
    addLogSink(sampled);
    log(LogLevel.Info, 'a');
    log(LogLevel.Info, 'b');
    expect(forwarded).toHaveLength(2);
  });
});

describe('createTextLogFormatter', () => {
  it('produces a readable prefix + message line', () => {
    const fmt = createTextLogFormatter();
    const entry: LogEntry = { level: LogLevel.Warn, channel: 'batch', data: 'test' };
    expect(fmt(entry)).toBe('[batch] test');
  });

  it('includes timestamp prefix when requested', () => {
    const fmt = createTextLogFormatter({ timestamp: true });
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: 'x' };
    expect(fmt(entry)).toMatch(/^t=\d+\.\d+ \[flight\] x$/);
  });

  it('includes level prefix when requested', () => {
    const fmt = createTextLogFormatter({ levelPrefix: true });
    const entry: LogEntry = { level: LogLevel.Error, channel: 'ch', data: 'boom' };
    expect(fmt(entry)).toBe('error [ch] boom');
  });
});

describe('createWebLogTransportBackend', () => {
  it('returns a no-op backend with a write function', () => {
    const backend = createWebLogTransportBackend();
    expect(typeof backend.write).toBe('function');
    expect(() => backend.write('test line')).not.toThrow();
  });
});

describe('disposeFileLogSink', () => {
  it('calls flush and dispose on the installed transport backend', () => {
    const flushed: boolean[] = [];
    const disposed: boolean[] = [];
    setLogTransportBackend({
      write: () => {},
      flush: () => flushed.push(true),
      dispose: () => disposed.push(true),
    });
    const handle = createFileLogSink();
    disposeFileLogSink(handle);
    expect(flushed).toHaveLength(1);
    expect(disposed).toHaveLength(1);
  });

  it('is a no-op when no backend is installed', () => {
    const handle = createFileLogSink();
    expect(() => disposeFileLogSink(handle)).not.toThrow();
  });
});

describe('disposeLogSink', () => {
  it('is covered by createBufferedLogSink tests', () => {
    // Verified above in createBufferedLogSink describe.
    expect(true).toBe(true);
  });
});

describe('enableLogSignals', () => {
  afterEach(() => {
    // Reset signals (they are lazy-created; clearLogSinks does not reset them)
    // We test with fresh sinks to avoid cross-test coupling.
    clearLogSinks();
  });

  it('returns a LogSignals entity with onLogEntry and onLogError signals', () => {
    const signals: LogSignals = enableLogSignals();
    expect(signals.onLogEntry).toBeDefined();
    expect(signals.onLogError).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const a = enableLogSignals();
    const b = enableLogSignals();
    expect(a).toBe(b);
  });

  it('onLogEntry fires for every emitted entry', () => {
    const signals = enableLogSignals();
    const received: LogEntry[] = [];
    connectSignal(signals.onLogEntry, (e) => received.push({ ...e }));
    // Even with no sinks the signal path fires (signals bypass the sinks-empty fast path)
    log(LogLevel.Info, 'via-signal');
    expect(received).toHaveLength(1);
    expect(received[0].data).toBe('via-signal');
  });

  it('onLogError fires only for Error-level entries', () => {
    const signals = enableLogSignals();
    const errors: LogEntry[] = [];
    connectSignal(signals.onLogError, (e) => errors.push({ ...e }));
    log(LogLevel.Info, 'not-error');
    log(LogLevel.Error, 'is-error');
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe(LogLevel.Error);
  });
});

describe('endLogGroup', () => {
  it('emits a Debug group-end entry and decrements nesting depth', () => {
    const { entries } = recordingSink();
    beginLogGroup('setup');
    entries.length = 0; // clear begin entry
    endLogGroup();
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ group: 'end' });
  });

  it('is a no-op when no group is open', () => {
    const { entries } = recordingSink();
    endLogGroup();
    expect(entries).toHaveLength(0);
  });
});

describe('endLogTimer', () => {
  it('emits a Debug entry with label and elapsedMs fields and returns elapsed', () => {
    const entries: LogEntry[] = [];
    addLogSink((e) => entries.push({ ...e }));
    const timer = startLogTimer('op', 'perf');
    const elapsed = endLogTimer(timer);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Debug);
    expect(entries[0].channel).toBe('perf');
    expect(entries[0].data).toMatchObject({ label: 'op' });
  });
});

describe('enterLogSpan', () => {
  afterEach(() => {
    // Ensure spans are cleaned up
    const span = createLogSpan('cleanup');
    exitLogSpan(span);
  });

  it('merges span fields into emitted entries while the span is active', () => {
    const { entries } = recordingSink();
    const span = createLogSpan('request', { reqId: 'abc' });
    enterLogSpan(span);
    log(LogLevel.Info, 'inside span');
    exitLogSpan(span);
    expect(entries[0].data).toMatchObject({ reqId: 'abc' });
  });

  it('does not merge span fields after exitLogSpan', () => {
    const { entries } = recordingSink();
    const span = createLogSpan('request', { reqId: 'def' });
    enterLogSpan(span);
    exitLogSpan(span);
    log(LogLevel.Info, 'outside span');
    expect(entries[0].data).toBe('outside span');
  });

  it('newer spans win on field key collision', () => {
    const { entries } = recordingSink();
    const span1 = createLogSpan('outer', { x: 1, y: 10 });
    const span2 = createLogSpan('inner', { x: 2 });
    enterLogSpan(span1);
    enterLogSpan(span2);
    log(LogLevel.Info, 'nested');
    exitLogSpan(span2);
    exitLogSpan(span1);
    expect((entries[0].data as Record<string, unknown>).x).toBe(2);
    expect((entries[0].data as Record<string, unknown>).y).toBe(10);
  });
});

describe('exitLogSpan', () => {
  it('is a no-op when the span is not in the stack', () => {
    const { entries } = recordingSink();
    const span = createLogSpan('phantom', { z: 1 });
    exitLogSpan(span);
    log(LogLevel.Info, 'clean');
    expect(entries[0].data).toBe('clean');
  });

  it('supports out-of-order exit (removes by identity)', () => {
    const { entries } = recordingSink();
    const span1 = createLogSpan('a', { a: 1 });
    const span2 = createLogSpan('b', { b: 2 });
    enterLogSpan(span1);
    enterLogSpan(span2);
    // Exit span1 first even though span2 was entered last
    exitLogSpan(span1);
    log(LogLevel.Info, 'after-a-exit');
    exitLogSpan(span2);
    expect((entries[0].data as Record<string, unknown>).b).toBe(2);
    expect((entries[0].data as Record<string, unknown>).a).toBeUndefined();
  });
});

describe('flushLogSink', () => {
  it('is covered by createBufferedLogSink tests', () => {
    expect(true).toBe(true);
  });
});

describe('getLogChannelLevel', () => {
  it('returns null when no channel level is set', () => {
    expect(getLogChannelLevel('unknown')).toBeNull();
  });

  it('returns the set level for a known channel', () => {
    setLogChannelLevel('render', LogLevel.Error);
    expect(getLogChannelLevel('render')).toBe(LogLevel.Error);
  });
});

describe('getLogConsoleLevel', () => {
  it('returns the current threshold', () => {
    setLogConsoleLevel(LogLevel.Verbose);
    expect(getLogConsoleLevel()).toBe(LogLevel.Verbose);
  });
});

describe('getLogLevel', () => {
  it('returns the current global emit level', () => {
    setLogLevel(LogLevel.Error);
    expect(getLogLevel()).toBe(LogLevel.Error);
  });
});

describe('getLogLevelName', () => {
  it('returns the canonical lowercase name for each level', () => {
    expect(getLogLevelName(LogLevel.None)).toBe('none');
    expect(getLogLevelName(LogLevel.Error)).toBe('error');
    expect(getLogLevelName(LogLevel.Warn)).toBe('warn');
    expect(getLogLevelName(LogLevel.Info)).toBe('info');
    expect(getLogLevelName(LogLevel.Debug)).toBe('debug');
    expect(getLogLevelName(LogLevel.Verbose)).toBe('verbose');
  });
});

describe('getLogTransportBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getLogTransportBackend()).toBeNull();
  });

  it('returns the installed backend', () => {
    const backend = createWebLogTransportBackend();
    setLogTransportBackend(backend);
    expect(getLogTransportBackend()).toBe(backend);
  });
});

describe('getMemoryLogSinkEntries', () => {
  it('returns empty array before any entries', () => {
    const handle = createMemoryLogSink(5);
    expect(getMemoryLogSinkEntries(handle)).toHaveLength(0);
  });
});

describe('log', () => {
  it('forwards level, channel, and data to all sinks', () => {
    const { entries } = recordingSink();
    log(LogLevel.Warn, { k: 1 }, 'shader');
    expect(entries[0]).toEqual({ level: LogLevel.Warn, channel: 'shader', data: { k: 1 } });
  });

  it('defaults the channel to null', () => {
    const { entries } = recordingSink();
    log(LogLevel.Info, 'x');
    expect(entries[0].channel).toBeNull();
  });

  it('does nothing when no sink is installed', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(() => log(LogLevel.Info, 'x')).not.toThrow();
    expect(debug).not.toHaveBeenCalled();
  });

  it('accepts a lazy data provider thunk', () => {
    const { entries } = recordingSink();
    const provider = vi.fn(() => 'lazy-value');
    log(LogLevel.Info, provider);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(entries[0].data).toBe('lazy-value');
  });

  it('does not call the thunk when the level is suppressed', () => {
    recordingSink();
    setLogLevel(LogLevel.Error);
    const provider = vi.fn(() => 'should-not-be-called');
    log(LogLevel.Verbose, provider);
    expect(provider).not.toHaveBeenCalled();
  });

  it('fans out to multiple sinks', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    addLogSink((e) => a.push({ ...e }));
    addLogSink((e) => b.push({ ...e }));
    log(LogLevel.Info, 'multi');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe('logAssert', () => {
  it('emits an Error entry when condition is false', () => {
    const { entries } = recordingSink();
    logAssert(false, 'assertion failed');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Error);
  });

  it('does not emit when condition is true', () => {
    const { entries } = recordingSink();
    logAssert(true, 'should not emit');
    expect(entries).toHaveLength(0);
  });
});

describe('logDebug', () => {
  it('emits at LogLevel.Debug', () => {
    const { entries } = recordingSink();
    logDebug('d', 'chan');
    expect(entries[0]).toEqual({ level: LogLevel.Debug, channel: 'chan', data: 'd' });
  });

  it('accepts a lazy provider', () => {
    const { entries } = recordingSink();
    logDebug(() => 'lazy', null);
    expect(entries[0].data).toBe('lazy');
  });
});

describe('logDebugWith', () => {
  it('emits at Debug with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext('ch', { reqId: 'abc' });
    logDebugWith(ctx, 'msg');
    expect(entries[0]).toMatchObject({ level: LogLevel.Debug, channel: 'ch', data: { msg: 'msg', reqId: 'abc' } });
  });
});

describe('logError', () => {
  it('emits at LogLevel.Error', () => {
    const { entries } = recordingSink();
    logError('e');
    expect(entries[0].level).toBe(LogLevel.Error);
  });
});

describe('logErrorWith', () => {
  it('emits at Error with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext('ch', { reqId: '1' });
    logErrorWith(ctx, 'fail');
    expect(entries[0]).toMatchObject({ level: LogLevel.Error, data: { msg: 'fail', reqId: '1' } });
  });
});

describe('logInfo', () => {
  it('emits at LogLevel.Info', () => {
    const { entries } = recordingSink();
    logInfo('i');
    expect(entries[0].level).toBe(LogLevel.Info);
  });
});

describe('logInfoWith', () => {
  it('emits at Info with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext('ch', { v: 2 });
    logInfoWith(ctx, { extra: true });
    expect(entries[0].data).toMatchObject({ v: 2, extra: true });
  });
});

describe('logOnce', () => {
  afterEach(() => {
    // Reset module-level once-key set by clearing the internal state via a fresh import.
    // Since we can't easily reset the module state, we test idempotency within a single test.
  });

  it('emits only the first time for a given key', () => {
    const { entries } = recordingSink();
    logOnce('key1', LogLevel.Warn, 'first');
    logOnce('key1', LogLevel.Warn, 'second');
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toBe('first');
  });

  it('allows different keys to emit independently', () => {
    const { entries } = recordingSink();
    logOnce('key2a', LogLevel.Info, 'a');
    logOnce('key2b', LogLevel.Info, 'b');
    expect(entries).toHaveLength(2);
  });

  it('returns true on first emit, false on subsequent calls', () => {
    recordingSink();
    expect(logOnce('key3', LogLevel.Info, 'x')).toBe(true);
    expect(logOnce('key3', LogLevel.Info, 'x')).toBe(false);
  });
});

describe('logVerbose', () => {
  it('emits at LogLevel.Verbose', () => {
    const { entries } = recordingSink();
    logVerbose('v');
    expect(entries[0].level).toBe(LogLevel.Verbose);
  });
});

describe('logVerboseWith', () => {
  it('emits at Verbose with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext(null, { trace: true });
    logVerboseWith(ctx, 'trace-msg');
    expect(entries[0].data).toMatchObject({ msg: 'trace-msg', trace: true });
  });
});

describe('logWarn', () => {
  it('emits at LogLevel.Warn', () => {
    const { entries } = recordingSink();
    logWarn('w');
    expect(entries[0].level).toBe(LogLevel.Warn);
  });
});

describe('logWarnWith', () => {
  it('emits at Warn with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext('ch', { ctx: 'val' });
    logWarnWith(ctx, 'warning');
    expect(entries[0].data).toMatchObject({ msg: 'warning', ctx: 'val' });
  });
});

describe('logWith', () => {
  it('emits at the given level with channel from context', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext('render', { frame: 1 });
    logWith(ctx, LogLevel.Info, 'update');
    expect(entries[0]).toMatchObject({ level: LogLevel.Info, channel: 'render', data: { msg: 'update', frame: 1 } });
  });

  it('passes record data through with fields merged', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext(null, { base: 1 });
    logWith(ctx, LogLevel.Debug, { extra: 2 });
    expect(entries[0].data).toEqual({ base: 1, extra: 2 });
  });

  it('accepts a lazy provider', () => {
    const { entries } = recordingSink();
    const ctx = createLogContext(null, {});
    logWith(ctx, LogLevel.Info, () => 'lazy');
    expect(entries[0].data).toBe('lazy');
  });
});

describe('parseLogLevel', () => {
  it('parses canonical names to their LogLevel values', () => {
    expect(parseLogLevel('error')).toBe(LogLevel.Error);
    expect(parseLogLevel('warn')).toBe(LogLevel.Warn);
    expect(parseLogLevel('info')).toBe(LogLevel.Info);
    expect(parseLogLevel('debug')).toBe(LogLevel.Debug);
    expect(parseLogLevel('verbose')).toBe(LogLevel.Verbose);
    expect(parseLogLevel('none')).toBe(LogLevel.None);
  });

  it('is case-insensitive', () => {
    expect(parseLogLevel('ERROR')).toBe(LogLevel.Error);
    expect(parseLogLevel('Warn')).toBe(LogLevel.Warn);
  });

  it('returns null for unknown names', () => {
    expect(parseLogLevel('unknown')).toBeNull();
    expect(parseLogLevel('')).toBeNull();
  });
});

describe('registerLogSerializer', () => {
  it('applies the serializer when the JSON formatter encounters a matching __kind', () => {
    registerLogSerializer('acme.Point', (v) => {
      const p = v as { x: number; y: number };
      return { serialized: `(${p.x},${p.y})` };
    });
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: { pt: { __kind: 'acme.Point', x: 3, y: 4 } } };
    const result = JSON.parse(fmt(entry));
    expect(result.data.pt).toEqual({ serialized: '(3,4)' });
  });
});

describe('removeLogSink', () => {
  it('removes a previously added sink and returns true', () => {
    const entries: LogEntry[] = [];
    const sink = (e: Readonly<LogEntry>): void => {
      entries.push({ ...e });
    };
    addLogSink(sink);
    const removed = removeLogSink(sink);
    expect(removed).toBe(true);
    log(LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });

  it('returns false when the sink was not registered', () => {
    const sink = (): void => {};
    expect(removeLogSink(sink)).toBe(false);
  });
});

describe('serializeLogError', () => {
  it('extracts name, message, and stack from an Error', () => {
    const err = new Error('boom');
    const result = serializeLogError(err);
    expect(result.name).toBe('Error');
    expect(result.message).toBe('boom');
    expect(typeof result.stack).toBe('string');
  });

  it('recursively serializes the cause chain', () => {
    const inner = new Error('inner');
    const outer = new Error('outer', { cause: inner });
    const result = serializeLogError(outer);
    expect((result.cause as Record<string, unknown>).message).toBe('inner');
  });

  it('wraps a non-Error value in { value }', () => {
    expect(serializeLogError('oops')).toEqual({ value: 'oops' });
    expect(serializeLogError(42)).toEqual({ value: '42' });
  });
});

describe('setLogChannelLevel', () => {
  it('suppresses entries below the channel level', () => {
    const { entries } = recordingSink();
    setLogChannelLevel('render', LogLevel.Error);
    log(LogLevel.Info, 'info on render channel', 'render');
    log(LogLevel.Error, 'error on render channel', 'render');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Error);
  });

  it('does not affect other channels', () => {
    const { entries } = recordingSink();
    setLogChannelLevel('render', LogLevel.Error);
    log(LogLevel.Info, 'other', 'audio');
    expect(entries).toHaveLength(1);
  });
});

describe('setLogConsoleLevel', () => {
  it('raises the threshold so finer levels print a human line', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogConsoleLevel(LogLevel.Verbose);
    setLogSink(createConsoleCaptureSink());
    log(LogLevel.Verbose, 'now shown');
    expect(consoleLog).toHaveBeenCalledTimes(1);
  });
});

describe('setLogLevel', () => {
  it('suppresses entries below the global level', () => {
    const { entries } = recordingSink();
    setLogLevel(LogLevel.Error);
    log(LogLevel.Info, 'suppressed');
    log(LogLevel.Error, 'emitted');
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toBe('emitted');
  });

  it('LogLevel.None always suppresses (never-emit guard)', () => {
    const { entries } = recordingSink();
    setLogLevel(LogLevel.None);
    log(LogLevel.None, 'should not emit');
    expect(entries).toHaveLength(0);
  });
});

describe('setLogRedactionPaths', () => {
  it('replaces top-level fields matching a path', () => {
    setLogRedactionPaths(['password']);
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: { user: 'alice', password: 'secret' } };
    const result = JSON.parse(fmt(entry));
    expect(result.data.password).toBe('[REDACTED]');
    expect(result.data.user).toBe('alice');
  });

  it('replaces nested fields with dot-notation paths', () => {
    setLogRedactionPaths(['auth.secret']);
    const fmt = createJsonLogFormatter();
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: { auth: { secret: 'tok', name: 'jwt' } } };
    const result = JSON.parse(fmt(entry));
    expect(result.data.auth.secret).toBe('[REDACTED]');
    expect(result.data.auth.name).toBe('jwt');
  });

  it('does not mutate the original data object (alias-safe)', () => {
    setLogRedactionPaths(['key']);
    const original = { key: 'value', other: 'safe' };
    const entry: LogEntry = { level: LogLevel.Info, channel: null, data: original };
    const fmt = createJsonLogFormatter();
    fmt(entry);
    // The original object should not be mutated
    expect(original.key).toBe('value');
  });
});

describe('setLogSink', () => {
  it('clears the sink list when passed null', () => {
    const { entries } = recordingSink();
    setLogSink(null);
    log(LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });

  it('replaces all existing sinks with the single given sink', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    addLogSink((e) => a.push({ ...e }));
    setLogSink((e) => b.push({ ...e }));
    log(LogLevel.Info, 'x');
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });
});

describe('setLogTransportBackend', () => {
  it('sets and retrieves the backend', () => {
    const backend = createWebLogTransportBackend();
    setLogTransportBackend(backend);
    expect(getLogTransportBackend()).toBe(backend);
  });

  it('clears the backend when null is passed', () => {
    setLogTransportBackend(createWebLogTransportBackend());
    setLogTransportBackend(null);
    expect(getLogTransportBackend()).toBeNull();
  });
});

describe('startLogTimer', () => {
  it('returns a LogTimer with the given label and channel', () => {
    const timer = startLogTimer('render', 'perf');
    expect(timer.label).toBe('render');
    expect(timer.channel).toBe('perf');
    expect(timer.startedAt).toBeGreaterThanOrEqual(0);
  });
});
