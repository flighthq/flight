import { allocateEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type {
  BufferedLogSink,
  LogContext,
  LogData,
  LogEntry,
  LogSignals,
  LogSpan,
  MemoryLogSink,
  RateLimitedLogSink,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, LogLevel } from '@flighthq/types/contract';

import { createConsoleCaptureSink } from './consoleLogSink.ts';
import type { LogState } from './log.ts';
import {
  addLogSink,
  advanceLogSink,
  beginLogGroup,
  clearLogChannelLevel,
  clearLogChannelLevels,
  clearLogGroups,
  clearLogOnceKeys,
  clearLogRedactionPaths,
  clearLogSerializers,
  clearLogSinks,
  clearMemoryLogSink,
  createBufferedLogSink,
  createChildLogContext,
  createFanoutLogSink,
  createFilterLogSink,
  createJsonLogFormatter,
  createLogContext,
  createLogSpan,
  createLogState,
  createMemoryLogSink,
  createRateLimitedLogSink,
  createSampledLogSink,
  createTextLogFormatter,
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
  getMemoryLogSinkEntries,
  initializeBufferedLogSink,
  initializeLogContext,
  initializeLogSpan,
  initializeLogState,
  initializeMemoryLogSink,
  initializeRateLimitedLogSink,
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
  startLogTimer,
} from './log.ts';

function contextOf(channel: string | null, fields: Readonly<Record<string, unknown>> = {}): LogContext {
  const context = createLogContext();
  context.channel = channel;
  context.fields = fields;
  return context;
}

function entryOf(level: LogLevel, channel: string | null, data: LogData, timestampMs = 0): LogEntry {
  return { level, channel, data, timestampMs };
}

function memoryEntries(handle: Readonly<MemoryLogSink>): LogEntry[] {
  const out: LogEntry[] = [];
  getMemoryLogSinkEntries(out, handle);
  return out;
}

function recordingSink(target: LogState = state): { entries: LogEntry[]; sink: (entry: LogEntry) => void } {
  const entries: LogEntry[] = [];
  const sink = (entry: Readonly<LogEntry>): void => {
    entries.push({ ...entry });
  };
  addLogSink(target, sink);
  return { entries, sink };
}

function spanOf(name: string, fields: Readonly<Record<string, unknown>> = {}, channel: string | null = null): LogSpan {
  const span = createLogSpan(state);
  span.name = name;
  span.fields = fields;
  span.channel = channel;
  return span;
}

let state: LogState;

beforeEach(() => {
  state = createLogState();
  vi.restoreAllMocks();
});

describe('addLogSink', () => {
  it('adds a sink that receives emitted entries', () => {
    const entries: LogEntry[] = [];
    addLogSink(state, (e) => entries.push({ ...e }));
    log(state, 0, LogLevel.Info, 'hello');
    expect(entries).toHaveLength(1);
  });

  it('does not add the same sink twice', () => {
    const entries: LogEntry[] = [];
    const sink = (e: Readonly<LogEntry>): void => {
      entries.push({ ...e });
    };
    addLogSink(state, sink);
    addLogSink(state, sink);
    log(state, 0, LogLevel.Info, 'x');
    expect(entries).toHaveLength(1);
  });

  it('isolates sinks and once keys between separate log states', () => {
    const other = createLogState();
    const { entries } = recordingSink();
    const { entries: otherEntries } = recordingSink(other);

    log(state, 0, LogLevel.Info, 'mine');
    expect(logOnce(state, 0, 'shared-key', LogLevel.Warn, 'first')).toBe(true);
    expect(logOnce(other, 0, 'shared-key', LogLevel.Warn, 'other-first')).toBe(true);

    expect(entries.map((entry) => entry.data)).toEqual(['mine', 'first']);
    expect(otherEntries.map((entry) => entry.data)).toEqual(['other-first']);
  });
});

describe('advanceLogSink', () => {
  it('only starts the interval on the first advance', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { intervalMs: 100 });
    handle.sink(entryOf(LogLevel.Info, null, 'queued'));

    advanceLogSink(handle, 1000);

    expect(forwarded).toHaveLength(0);
  });

  it('flushes once the interval has elapsed since the last flush', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { intervalMs: 100 });
    advanceLogSink(handle, 0);
    handle.sink(entryOf(LogLevel.Info, null, 'queued'));

    advanceLogSink(handle, 99);
    expect(forwarded).toHaveLength(0);
    advanceLogSink(handle, 100);
    expect(forwarded.map((entry) => entry.data)).toEqual(['queued']);
  });

  it('measures the next interval from the last flush', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { intervalMs: 100 });
    advanceLogSink(handle, 0);
    advanceLogSink(handle, 100);
    handle.sink(entryOf(LogLevel.Info, null, 'later'));

    advanceLogSink(handle, 150);
    expect(forwarded).toHaveLength(0);
    advanceLogSink(handle, 200);
    expect(forwarded).toHaveLength(1);
  });

  it('does nothing for an unknown handle', () => {
    const unknown: BufferedLogSink = { [EntityRuntimeKey]: undefined, sink: () => {} };

    expect(() => advanceLogSink(unknown, 0)).not.toThrow();
  });
});

describe('beginLogGroup', () => {
  it('emits a Debug group-begin entry and increments nesting depth', () => {
    const { entries } = recordingSink();
    beginLogGroup(state, 5, 'setup');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Debug);
    expect(entries[0].timestampMs).toBe(5);
    expect(entries[0].data).toMatchObject({ group: 'begin', depth: 1 });
  });

  it('nests: second beginLogGroup produces depth 2', () => {
    const { entries } = recordingSink();
    beginLogGroup(state, 0, 'outer');
    beginLogGroup(state, 0, 'inner');
    expect(entries[1].data).toMatchObject({ depth: 2 });
  });

  it('tracks depth without emitting when Debug is suppressed', () => {
    const { entries } = recordingSink();
    setLogLevel(state, LogLevel.Error);

    beginLogGroup(state, 0, 'suppressed');

    expect(entries).toHaveLength(0);
    expect(state.groupDepth).toBe(1);
  });
});

describe('clearLogChannelLevel', () => {
  it('removes only the named channel override', () => {
    setLogChannelLevel(state, 'render', LogLevel.Error);
    setLogChannelLevel(state, 'input', LogLevel.Warn);

    clearLogChannelLevel(state, 'render');

    expect(getLogChannelLevel(state, 'render')).toBeNull();
    expect(getLogChannelLevel(state, 'input')).toBe(LogLevel.Warn);
  });
});

describe('clearLogChannelLevels', () => {
  it('removes all per-channel level overrides', () => {
    setLogChannelLevel(state, 'render', LogLevel.Error);
    clearLogChannelLevels(state);
    expect(getLogChannelLevel(state, 'render')).toBeNull();
  });
});

describe('clearLogGroups', () => {
  it('resets group nesting depth to zero without emitting', () => {
    const { entries } = recordingSink();
    beginLogGroup(state, 0, 'a');
    beginLogGroup(state, 0, 'b');
    entries.length = 0;
    clearLogGroups(state);
    // After clearLogGroups, endLogGroup should be a no-op (depth is 0)
    endLogGroup(state, 0);
    expect(entries).toHaveLength(0);
  });
});

describe('clearLogOnceKeys', () => {
  it('allows a previously consumed key to fire again', () => {
    const { entries } = recordingSink();
    logOnce(state, 0, 'once-clear-test', LogLevel.Warn, 'first');
    expect(entries).toHaveLength(1);
    clearLogOnceKeys(state);
    logOnce(state, 0, 'once-clear-test', LogLevel.Warn, 'second');
    expect(entries).toHaveLength(2);
    expect(entries[1].data).toBe('second');
  });
});

describe('clearLogRedactionPaths', () => {
  it('removes all redaction paths so fields are no longer redacted', () => {
    setLogRedactionPaths(state, ['token']);
    clearLogRedactionPaths(state);
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { token: 'secret' })));
    expect(result.data.token).toBe('secret');
  });
});

describe('clearLogSerializers', () => {
  it('removes all serializer registrations', () => {
    registerLogSerializer(state, 'acme.Foo', () => ({ serialized: true }));
    clearLogSerializers(state);
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { obj: { __kind: 'acme.Foo', x: 1 } })));
    // Without serializer the value should pass through as-is
    expect(result.data.obj.__kind).toBe('acme.Foo');
  });
});

describe('clearLogSinks', () => {
  it('removes all sinks so subsequent emit calls are no-ops', () => {
    const entries: LogEntry[] = [];
    addLogSink(state, (e) => entries.push({ ...e }));
    clearLogSinks(state);
    log(state, 0, LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });
});

describe('clearMemoryLogSink', () => {
  it('empties the captured entries', () => {
    const handle = createMemoryLogSink(10);
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'a');
    clearMemoryLogSink(handle);
    expect(memoryEntries(handle)).toHaveLength(0);
  });

  it('restarts the ring at the oldest slot after clearing a wrapped buffer', () => {
    const handle = createMemoryLogSink(2);
    addLogSink(state, handle.sink);
    for (const data of ['a', 'b', 'c']) log(state, 0, LogLevel.Info, data);
    clearMemoryLogSink(handle);
    log(state, 0, LogLevel.Info, 'd');
    log(state, 0, LogLevel.Info, 'e');
    expect(memoryEntries(handle).map((entry) => entry.data)).toEqual(['d', 'e']);
  });

  it('does nothing for an unknown handle', () => {
    const unknown: MemoryLogSink = { [EntityRuntimeKey]: undefined, sink: () => {} };

    expect(() => clearMemoryLogSink(unknown)).not.toThrow();
  });
});

describe('createBufferedLogSink', () => {
  it('uses the default size and interval options', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((entry) => forwarded.push({ ...entry }));
    for (let i = 0; i < 99; i++) handle.sink(entryOf(LogLevel.Info, null, `queued-${i}`));
    advanceLogSink(handle, 0);
    advanceLogSink(handle, 999);

    expect(forwarded).toHaveLength(0);
    advanceLogSink(handle, 1000);
    expect(forwarded).toHaveLength(99);
    handle.sink(entryOf(LogLevel.Info, null, 'below-size'));
    expect(forwarded).toHaveLength(99);
  });

  it('never schedules an interval timer', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    const handle = createBufferedLogSink(() => {}, { intervalMs: 1, size: 1 });
    disposeLogSink(handle);

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('does nothing when an empty buffer is flushed', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((entry) => forwarded.push({ ...entry }), { intervalMs: 0 });

    flushLogSink(handle);

    expect(forwarded).toHaveLength(0);
  });

  it('does not forward entries until flushed', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100, intervalMs: 0 });
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'queued');
    expect(forwarded).toHaveLength(0);
    flushLogSink(handle);
    expect(forwarded).toHaveLength(1);
  });

  it('auto-flushes when buffer reaches size', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 2, intervalMs: 0 });
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'a');
    log(state, 0, LogLevel.Info, 'b');
    expect(forwarded).toHaveLength(2);
  });

  it('keeps its own copy of each queued entry', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100 });
    const entry = entryOf(LogLevel.Info, null, 'original', 7);
    handle.sink(entry);
    entry.data = 'rewritten';

    flushLogSink(handle);

    expect(forwarded[0]).toEqual(entryOf(LogLevel.Info, null, 'original', 7));
  });

  it('disposeLogSink flushes pending entries', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100, intervalMs: 0 });
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'pending');
    disposeLogSink(handle);
    expect(forwarded).toHaveLength(1);
  });
});

describe('createChildLogContext', () => {
  it('merges parent and child fields (child wins)', () => {
    const parent = contextOf('chan', { a: 1, b: 2 });
    const child = createChildLogContext(parent, { b: 99, c: 3 });
    expect(child.fields).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('inherits parent channel when no override given', () => {
    const parent = contextOf('parent');
    const child = createChildLogContext(parent, {});
    expect(child.channel).toBe('parent');
  });

  it('overrides channel when provided', () => {
    const parent = contextOf('parent');
    const child = createChildLogContext(parent, {}, 'child');
    expect(child.channel).toBe('child');
  });

  it('overrides the channel with an explicit null', () => {
    const child = createChildLogContext(contextOf('parent'), {}, null);
    expect(child.channel).toBeNull();
  });
});

describe('createFanoutLogSink', () => {
  it('forwards each entry to all component sinks', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    const fanout = createFanoutLogSink([(e) => a.push({ ...e }), (e) => b.push({ ...e })]);
    addLogSink(state, fanout);
    log(state, 0, LogLevel.Info, 'hello');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('copies the sink list so later edits to the array do not change the fan-out', () => {
    const a: LogEntry[] = [];
    const sinks = [(e: Readonly<LogEntry>): void => void a.push({ ...e })];
    const fanout = createFanoutLogSink(sinks);
    sinks.length = 0;

    fanout(entryOf(LogLevel.Info, null, 'still-forwarded'));

    expect(a).toHaveLength(1);
  });
});

describe('createFilterLogSink', () => {
  it('only forwards entries matching the predicate', () => {
    const entries: LogEntry[] = [];
    const filtered = createFilterLogSink(
      (e) => entries.push({ ...e }),
      (e) => e.level === LogLevel.Error,
    );
    addLogSink(state, filtered);
    log(state, 0, LogLevel.Info, 'skip');
    log(state, 0, LogLevel.Error, 'keep');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Error);
  });
});

describe('createJsonLogFormatter', () => {
  it('produces a __flight JSON envelope', () => {
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, 'test', 'msg')));
    expect(result).toMatchObject({ __flight: true, level: 'info', channel: 'test', data: { msg: 'msg' } });
  });

  it("uses the entry's own timestamp as t", () => {
    const fmt = createJsonLogFormatter(state);
    expect(JSON.parse(fmt(entryOf(LogLevel.Info, null, 'msg', 42.5))).t).toBe(42.5);
  });

  it('applies registered serializers to values with matching __kind', () => {
    registerLogSerializer(state, 'acme.Widget', (v) => ({ serialized: true, id: (v as { id: number }).id }));
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { widget: { __kind: 'acme.Widget', id: 42 } })));
    expect(result.data.widget).toEqual({ serialized: true, id: 42 });
  });

  it('applies redaction paths to nested fields', () => {
    setLogRedactionPaths(state, ['credentials.token', 'password']);
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(
      fmt(entryOf(LogLevel.Info, null, { credentials: { token: 'secret', user: 'alice' }, password: 'pw' })),
    );
    expect(result.data.credentials.token).toBe('[REDACTED]');
    expect(result.data.credentials.user).toBe('alice');
    expect(result.data.password).toBe('[REDACTED]');
  });

  it('reads redaction and serializers from its state at format time', () => {
    const fmt = createJsonLogFormatter(state);
    setLogRedactionPaths(state, ['token']);

    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { token: 'secret' })));

    expect(result.data.token).toBe('[REDACTED]');
  });
});

describe('createLogContext', () => {
  it('creates an empty context to assign', () => {
    const ctx = createLogContext();
    expect(ctx.channel).toBeNull();
    expect(ctx.fields).toEqual({});
  });

  it('carries an assigned channel and fields into contextual emits', () => {
    const { entries } = recordingSink();
    const ctx = contextOf('render', { version: 1 });
    logWith(state, 0, ctx, LogLevel.Info, 'x');
    expect(entries[0]).toMatchObject({ channel: 'render', data: { msg: 'x', version: 1 } });
  });
});

describe('createLogSpan', () => {
  it('creates an empty span with the next id from the state', () => {
    const first = createLogSpan(state);
    const second = createLogSpan(state);
    expect(first.name).toBe('');
    expect(first.fields).toEqual({});
    expect(first.channel).toBeNull();
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
  });

  it('allocates ids per state', () => {
    createLogSpan(state);
    expect(createLogSpan(createLogState()).id).toBe(1);
  });
});

describe('createLogState', () => {
  it('starts with no sinks, Verbose emit level, and Info console level', () => {
    const fresh = createLogState();
    expect(fresh.sinks).toEqual([]);
    expect(getLogLevel(fresh)).toBe(LogLevel.Verbose);
    expect(getLogConsoleLevel(fresh)).toBe(LogLevel.Info);
    expect(fresh.groupDepth).toBe(0);
    expect(fresh.signals).toBeNull();
    expect(fresh.nextSpanId).toBe(1);
  });

  it('creates an Entity', () => {
    expect(EntityRuntimeKey in createLogState()).toBe(true);
  });
});

describe('createMemoryLogSink', () => {
  it('captures entries up to capacity', () => {
    const handle = createMemoryLogSink(3);
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'a');
    log(state, 0, LogLevel.Info, 'b');
    log(state, 0, LogLevel.Info, 'c');
    expect(memoryEntries(handle)).toHaveLength(3);
  });

  it('overwrites oldest entries when capacity is exceeded (ring buffer)', () => {
    const handle = createMemoryLogSink(2);
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'first');
    log(state, 0, LogLevel.Info, 'second');
    log(state, 0, LogLevel.Info, 'third');
    const entries = memoryEntries(handle);
    expect(entries).toHaveLength(2);
    expect(entries[0].data).toBe('second');
    expect(entries[1].data).toBe('third');
  });

  it('returns entries oldest-first after capacity exceeded', () => {
    const handle = createMemoryLogSink(3);
    addLogSink(state, handle.sink);
    for (let i = 0; i < 5; i++) log(state, 0, LogLevel.Info, `msg${i}`);
    expect(memoryEntries(handle).map((e) => e.data)).toEqual(['msg2', 'msg3', 'msg4']);
  });

  it('stores the timestamp and its own copy of each entry', () => {
    const handle = createMemoryLogSink(1);
    const entry = entryOf(LogLevel.Warn, 'ch', 'kept', 12);
    handle.sink(entry);
    entry.data = 'rewritten';
    expect(memoryEntries(handle)).toEqual([entryOf(LogLevel.Warn, 'ch', 'kept', 12)]);
  });
});

describe('createRateLimitedLogSink', () => {
  it('limits entries per interval', () => {
    const forwarded: LogEntry[] = [];
    const handle = createRateLimitedLogSink((e) => forwarded.push({ ...e }), { maxPerInterval: 2, intervalMs: 10000 });
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'a');
    log(state, 0, LogLevel.Info, 'b');
    log(state, 0, LogLevel.Info, 'c'); // should be rate-limited
    expect(forwarded).toHaveLength(2);
  });

  it('tracks per-channel when perChannel is true', () => {
    const forwarded: LogEntry[] = [];
    const handle = createRateLimitedLogSink((e) => forwarded.push({ ...e }), {
      perChannel: true,
      maxPerInterval: 1,
      intervalMs: 10000,
    });
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'a', 'ch1');
    log(state, 0, LogLevel.Info, 'b', 'ch1'); // rate-limited for ch1
    log(state, 0, LogLevel.Info, 'c', 'ch2'); // allowed — different channel
    expect(forwarded).toHaveLength(2);
    expect(forwarded[0].channel).toBe('ch1');
    expect(forwarded[1].channel).toBe('ch2');
  });

  it('resets its budget once entry timestamps cross the interval', () => {
    const forwarded: LogEntry[] = [];
    const handle = createRateLimitedLogSink((entry) => forwarded.push({ ...entry }), {
      intervalMs: 100,
      maxPerInterval: 1,
    });
    addLogSink(state, handle.sink);
    log(state, 1000, LogLevel.Info, 'first');
    log(state, 1099, LogLevel.Info, 'suppressed');

    log(state, 1100, LogLevel.Info, 'next-window');

    expect(forwarded.map((entry) => entry.data)).toEqual(['first', 'next-window']);
  });
});

describe('createSampledLogSink', () => {
  it('forwards 1-in-N entries', () => {
    const forwarded: LogEntry[] = [];
    const sampled = createSampledLogSink((e) => forwarded.push({ ...e }), 3);
    addLogSink(state, sampled);
    for (let i = 0; i < 9; i++) log(state, 0, LogLevel.Info, `msg${i}`);
    expect(forwarded).toHaveLength(3);
  });

  it('passes all entries through when rate is 1', () => {
    const forwarded: LogEntry[] = [];
    const sampled = createSampledLogSink((e) => forwarded.push({ ...e }), 1);
    addLogSink(state, sampled);
    log(state, 0, LogLevel.Info, 'a');
    log(state, 0, LogLevel.Info, 'b');
    expect(forwarded).toHaveLength(2);
  });
});

describe('createTextLogFormatter', () => {
  it('produces a readable prefix + message line', () => {
    const fmt = createTextLogFormatter(state);
    expect(fmt(entryOf(LogLevel.Warn, 'batch', 'test'))).toBe('[batch] test');
  });

  it("includes the entry's timestamp when requested", () => {
    const fmt = createTextLogFormatter(state, { timestamp: true });
    expect(fmt(entryOf(LogLevel.Info, null, 'x', 12.345))).toBe('t=12.35 [flight] x');
  });

  it('includes level prefix when requested', () => {
    const fmt = createTextLogFormatter(state, { levelPrefix: true });
    expect(fmt(entryOf(LogLevel.Error, 'ch', 'boom'))).toBe('error [ch] boom');
  });

  it('labels an unknown numeric level', () => {
    const fmt = createTextLogFormatter(state, { levelPrefix: true });

    expect(fmt(entryOf(99 as LogLevel, null, 'message'))).toBe('unknown [flight] message');
  });

  it('serializes record data', () => {
    const fmt = createTextLogFormatter(state);

    expect(fmt(entryOf(LogLevel.Info, null, { value: 3 }))).toBe('[flight] {"value":3}');
  });

  it("indents entries while a group is open on the formatter's state", () => {
    beginLogGroup(state, 0, 'outer');
    const fmt = createTextLogFormatter(state, { indentGroups: true });

    const formatted = fmt(entryOf(LogLevel.Info, null, 'inside'));

    expect(formatted).toBe('[flight]    inside');
  });
});

describe('disposeLogSink', () => {
  it('flushes queued entries and leaves the sink callable', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100 });
    handle.sink(entryOf(LogLevel.Info, null, 'pending'));

    disposeLogSink(handle);
    handle.sink(entryOf(LogLevel.Info, null, 'after'));
    flushLogSink(handle);

    expect(forwarded.map((entry) => entry.data)).toEqual(['pending', 'after']);
  });

  it('does nothing for an unknown handle', () => {
    const unknown: BufferedLogSink = { [EntityRuntimeKey]: undefined, sink: () => {} };

    expect(() => disposeLogSink(unknown)).not.toThrow();
  });
});

describe('enableLogSignals', () => {
  it('returns a LogSignals entity with onLogEntry and onLogError signals', () => {
    const signals: LogSignals = enableLogSignals(state);
    expect(signals.onLogEntry).toBeDefined();
    expect(signals.onLogError).toBeDefined();
    expect(state.signals).toBe(signals);
  });

  it('returns the same object on subsequent calls', () => {
    const a = enableLogSignals(state);
    const b = enableLogSignals(state);
    expect(a).toBe(b);
  });

  it('gives each state its own signals', () => {
    expect(enableLogSignals(state)).not.toBe(enableLogSignals(createLogState()));
  });

  it('onLogEntry fires for every emitted entry', () => {
    const signals = enableLogSignals(state);
    const received: LogEntry[] = [];
    connectSignal(signals.onLogEntry, (e) => received.push({ ...e }));
    // Even with no sinks the signal path fires (signals bypass the sinks-empty fast path)
    log(state, 0, LogLevel.Info, 'via-signal');
    expect(received).toHaveLength(1);
    expect(received[0].data).toBe('via-signal');
  });

  it('onLogError fires only for Error-level entries', () => {
    const signals = enableLogSignals(state);
    const errors: LogEntry[] = [];
    connectSignal(signals.onLogError, (e) => errors.push({ ...e }));
    log(state, 0, LogLevel.Info, 'not-error');
    log(state, 0, LogLevel.Error, 'is-error');
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe(LogLevel.Error);
  });
});

describe('endLogGroup', () => {
  it('emits a Debug group-end entry and decrements nesting depth', () => {
    const { entries } = recordingSink();
    beginLogGroup(state, 0, 'setup');
    entries.length = 0; // clear begin entry
    endLogGroup(state, 9);
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ group: 'end', depth: 1 });
    expect(entries[0].timestampMs).toBe(9);
    expect(state.groupDepth).toBe(0);
  });

  it('is a no-op when no group is open', () => {
    const { entries } = recordingSink();
    endLogGroup(state, 0);
    expect(entries).toHaveLength(0);
  });

  it('closes the group without emitting when Debug is suppressed', () => {
    const { entries } = recordingSink();
    beginLogGroup(state, 0, 'visible');
    entries.length = 0;
    setLogLevel(state, LogLevel.Error);

    endLogGroup(state, 0);

    expect(entries).toHaveLength(0);
    expect(state.groupDepth).toBe(0);
  });
});

describe('endLogTimer', () => {
  it('emits a Debug entry with label and elapsedMs fields and returns elapsed', () => {
    const entries: LogEntry[] = [];
    addLogSink(state, (e) => entries.push({ ...e }));
    const timer = startLogTimer('op', 'perf', 10);
    const elapsed = endLogTimer(state, 25, timer);
    expect(elapsed).toBe(15);
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Debug);
    expect(entries[0].channel).toBe('perf');
    expect(entries[0].timestampMs).toBe(25);
    expect(entries[0].data).toMatchObject({ label: 'op', elapsedMs: 15 });
  });
});

describe('enterLogSpan', () => {
  it('merges span fields into emitted entries while the span is active', () => {
    const { entries } = recordingSink();
    const span = spanOf('request', { reqId: 'abc' });
    enterLogSpan(state, span);
    log(state, 0, LogLevel.Info, 'inside span');
    exitLogSpan(state, span);
    expect(entries[0].data).toMatchObject({ reqId: 'abc' });
  });

  it('does not merge span fields after exitLogSpan', () => {
    const { entries } = recordingSink();
    const span = spanOf('request', { reqId: 'def' });
    enterLogSpan(state, span);
    exitLogSpan(state, span);
    log(state, 0, LogLevel.Info, 'outside span');
    expect(entries[0].data).toBe('outside span');
  });

  it('newer spans win on field key collision', () => {
    const { entries } = recordingSink();
    const span1 = spanOf('outer', { x: 1, y: 10 });
    const span2 = spanOf('inner', { x: 2 });
    enterLogSpan(state, span1);
    enterLogSpan(state, span2);
    log(state, 0, LogLevel.Info, 'nested');
    exitLogSpan(state, span2);
    exitLogSpan(state, span1);
    expect((entries[0].data as Record<string, unknown>).x).toBe(2);
    expect((entries[0].data as Record<string, unknown>).y).toBe(10);
  });

  it('leaves data unchanged when active spans have no fields', () => {
    const { entries } = recordingSink();
    const span = spanOf('empty');
    enterLogSpan(state, span);

    log(state, 0, LogLevel.Info, 'unchanged');
    exitLogSpan(state, span);

    expect(entries[0].data).toBe('unchanged');
  });

  it('merges active span fields into record data with direct fields winning', () => {
    const { entries } = recordingSink();
    const span = spanOf('record', { inherited: 1, winner: 'span' });
    enterLogSpan(state, span);

    log(state, 0, LogLevel.Info, { direct: 2, winner: 'data' });
    exitLogSpan(state, span);

    expect(entries[0].data).toEqual({ direct: 2, inherited: 1, winner: 'data' });
  });

  it('does not leak an active span into another state', () => {
    const other = createLogState();
    const { entries } = recordingSink(other);
    enterLogSpan(state, spanOf('mine', { leaked: true }));

    log(other, 0, LogLevel.Info, 'clean');

    expect(entries[0].data).toBe('clean');
  });
});

describe('exitLogSpan', () => {
  it('is a no-op when the span is not in the stack', () => {
    const { entries } = recordingSink();
    const span = spanOf('phantom', { z: 1 });
    exitLogSpan(state, span);
    log(state, 0, LogLevel.Info, 'clean');
    expect(entries[0].data).toBe('clean');
  });

  it('supports out-of-order exit', () => {
    const { entries } = recordingSink();
    const span1 = spanOf('a', { a: 1 });
    const span2 = spanOf('b', { b: 2 });
    enterLogSpan(state, span1);
    enterLogSpan(state, span2);
    // Exit span1 first even though span2 was entered last
    exitLogSpan(state, span1);
    log(state, 0, LogLevel.Info, 'after-a-exit');
    exitLogSpan(state, span2);
    expect((entries[0].data as Record<string, unknown>).b).toBe(2);
    expect((entries[0].data as Record<string, unknown>).a).toBeUndefined();
  });

  it('matches the active span by id rather than object identity', () => {
    const { entries } = recordingSink();
    const span = spanOf('a', { a: 1 });
    enterLogSpan(state, span);

    exitLogSpan(state, { ...span });
    log(state, 0, LogLevel.Info, 'exited');

    expect(entries[0].data).toBe('exited');
  });
});

describe('flushLogSink', () => {
  it('forwards queued entries to the target in order', () => {
    const forwarded: LogEntry[] = [];
    const handle = createBufferedLogSink((e) => forwarded.push({ ...e }), { size: 100 });
    handle.sink(entryOf(LogLevel.Info, null, 'a'));
    handle.sink(entryOf(LogLevel.Info, null, 'b'));

    flushLogSink(handle);

    expect(forwarded.map((entry) => entry.data)).toEqual(['a', 'b']);
  });

  it('does nothing for an unknown handle', () => {
    const unknown: BufferedLogSink = { [EntityRuntimeKey]: undefined, sink: () => {} };

    expect(() => flushLogSink(unknown)).not.toThrow();
  });
});

describe('getLogChannelLevel', () => {
  it('returns null when no channel level is set', () => {
    expect(getLogChannelLevel(state, 'unknown')).toBeNull();
  });

  it('returns the set level for a known channel', () => {
    setLogChannelLevel(state, 'render', LogLevel.Error);
    expect(getLogChannelLevel(state, 'render')).toBe(LogLevel.Error);
  });
});

describe('getLogConsoleLevel', () => {
  it('returns the current threshold', () => {
    setLogConsoleLevel(state, LogLevel.Verbose);
    expect(getLogConsoleLevel(state)).toBe(LogLevel.Verbose);
  });
});

describe('getLogLevel', () => {
  it('returns the current global emit level', () => {
    setLogLevel(state, LogLevel.Error);
    expect(getLogLevel(state)).toBe(LogLevel.Error);
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

  it('returns unknown for an unrecognized numeric level', () => {
    expect(getLogLevelName(99 as LogLevel)).toBe('unknown');
  });
});

describe('getMemoryLogSinkEntries', () => {
  it('writes an empty list before any entries', () => {
    const handle = createMemoryLogSink(5);
    expect(memoryEntries(handle)).toHaveLength(0);
  });

  it('clears out before writing', () => {
    const handle = createMemoryLogSink(5);
    handle.sink(entryOf(LogLevel.Info, null, 'only'));
    const out = [entryOf(LogLevel.Error, null, 'stale')];

    getMemoryLogSinkEntries(out, handle);

    expect(out.map((entry) => entry.data)).toEqual(['only']);
  });

  it('writes an empty list for an unknown handle', () => {
    const unknown: MemoryLogSink = { [EntityRuntimeKey]: undefined, sink: () => {} };
    const out = [entryOf(LogLevel.Error, null, 'stale')];

    getMemoryLogSinkEntries(out, unknown);

    expect(out).toEqual([]);
  });
});

describe('initializeBufferedLogSink', () => {
  it('writes a buffered sink over the target into out', () => {
    const forwarded: LogEntry[] = [];
    const out = allocateEntity<BufferedLogSink>();

    initializeBufferedLogSink(out, (e) => forwarded.push({ ...e }), { size: 1 });
    out.sink(entryOf(LogLevel.Info, null, 'flushed-at-size'));

    expect(forwarded).toHaveLength(1);
  });
});

describe('initializeLogContext', () => {
  it('resets a context to no channel and no fields', () => {
    const context = contextOf('render', { a: 1 });

    initializeLogContext(context);

    expect(context.channel).toBeNull();
    expect(context.fields).toEqual({});
  });
});

describe('initializeLogSpan', () => {
  it('assigns the next id from the state and clears name, channel, and fields', () => {
    const span = spanOf('named', { a: 1 }, 'ch');

    initializeLogSpan(span, state);

    expect(span.id).toBe(2);
    expect(span.name).toBe('');
    expect(span.channel).toBeNull();
    expect(span.fields).toEqual({});
    expect(state.nextSpanId).toBe(3);
  });
});

describe('initializeLogState', () => {
  it('resets every field of an existing state', () => {
    addLogSink(state, () => {});
    setLogLevel(state, LogLevel.Error);
    setLogConsoleLevel(state, LogLevel.None);
    setLogChannelLevel(state, 'ch', LogLevel.Warn);
    logOnce(state, 0, 'key', LogLevel.Warn, 'x');
    setLogRedactionPaths(state, ['a']);
    registerLogSerializer(state, 'k', () => ({}));
    beginLogGroup(state, 0, 'g');
    enterLogSpan(state, spanOf('s'));
    enableLogSignals(state);

    initializeLogState(state);

    expect(state.sinks).toEqual([]);
    expect(state.level).toBe(LogLevel.Verbose);
    expect(state.consoleLevel).toBe(LogLevel.Info);
    expect(state.channelLevels.size).toBe(0);
    expect(state.onceKeys.size).toBe(0);
    expect(state.redactionPaths).toEqual([]);
    expect(state.serializers.size).toBe(0);
    expect(state.groupDepth).toBe(0);
    expect(state.spans).toEqual([]);
    expect(state.signals).toBeNull();
    expect(state.nextSpanId).toBe(1);
  });
});

describe('initializeMemoryLogSink', () => {
  it('writes an empty ring buffer of the given capacity into out', () => {
    const out = allocateEntity<MemoryLogSink>();

    initializeMemoryLogSink(out, 1);
    out.sink(entryOf(LogLevel.Info, null, 'a'));
    out.sink(entryOf(LogLevel.Info, null, 'b'));

    expect(memoryEntries(out as MemoryLogSink).map((entry) => entry.data)).toEqual(['b']);
  });
});

describe('initializeRateLimitedLogSink', () => {
  it('writes a rate-limited sink over the target into out', () => {
    const forwarded: LogEntry[] = [];
    const out = allocateEntity<RateLimitedLogSink>();

    initializeRateLimitedLogSink(out, (e) => forwarded.push({ ...e }), { intervalMs: 10, maxPerInterval: 1 });
    out.sink(entryOf(LogLevel.Info, null, 'a', 0));
    out.sink(entryOf(LogLevel.Info, null, 'b', 5));

    expect(forwarded.map((entry) => entry.data)).toEqual(['a']);
  });
});

describe('log', () => {
  it('forwards level, channel, data, and the caller timestamp to all sinks', () => {
    const { entries } = recordingSink();
    log(state, 3.5, LogLevel.Warn, { k: 1 }, 'shader');
    expect(entries[0]).toEqual({ level: LogLevel.Warn, channel: 'shader', data: { k: 1 }, timestampMs: 3.5 });
  });

  it('defaults the channel to null', () => {
    const { entries } = recordingSink();
    log(state, 0, LogLevel.Info, 'x');
    expect(entries[0].channel).toBeNull();
  });

  it('does nothing when no sink is installed', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(() => log(state, 0, LogLevel.Info, 'x')).not.toThrow();
    expect(debug).not.toHaveBeenCalled();
  });

  it('accepts a lazy data provider thunk', () => {
    const { entries } = recordingSink();
    const provider = vi.fn(() => 'lazy-value');
    log(state, 0, LogLevel.Info, provider);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(entries[0].data).toBe('lazy-value');
  });

  it('does not call the thunk when the level is suppressed', () => {
    recordingSink();
    setLogLevel(state, LogLevel.Error);
    const provider = vi.fn(() => 'should-not-be-called');
    log(state, 0, LogLevel.Verbose, provider);
    expect(provider).not.toHaveBeenCalled();
  });

  it('fans out to multiple sinks', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    addLogSink(state, (e) => a.push({ ...e }));
    addLogSink(state, (e) => b.push({ ...e }));
    log(state, 0, LogLevel.Info, 'multi');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('never reads a clock', () => {
    recordingSink();
    const now = vi.spyOn(Date, 'now');
    const performanceNow = vi.spyOn(performance, 'now');

    log(state, 1, LogLevel.Info, 'x');

    expect(now).not.toHaveBeenCalled();
    expect(performanceNow).not.toHaveBeenCalled();
  });
});

describe('logAssert', () => {
  it('emits an Error entry when condition is false', () => {
    const { entries } = recordingSink();
    logAssert(state, 0, false, 'assertion failed');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Error);
  });

  it('does not emit when condition is true', () => {
    const { entries } = recordingSink();
    logAssert(state, 0, true, 'should not emit');
    expect(entries).toHaveLength(0);
  });
});

describe('logDebug', () => {
  it('emits at LogLevel.Debug', () => {
    const { entries } = recordingSink();
    logDebug(state, 0, 'd', 'chan');
    expect(entries[0]).toEqual({ level: LogLevel.Debug, channel: 'chan', data: 'd', timestampMs: 0 });
  });

  it('accepts a lazy provider', () => {
    const { entries } = recordingSink();
    logDebug(state, 0, () => 'lazy', null);
    expect(entries[0].data).toBe('lazy');
  });
});

describe('logDebugWith', () => {
  it('emits at Debug with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = contextOf('ch', { reqId: 'abc' });
    logDebugWith(state, 0, ctx, 'msg');
    expect(entries[0]).toMatchObject({ level: LogLevel.Debug, channel: 'ch', data: { msg: 'msg', reqId: 'abc' } });
  });
});

describe('logError', () => {
  it('emits at LogLevel.Error', () => {
    const { entries } = recordingSink();
    logError(state, 0, 'e');
    expect(entries[0].level).toBe(LogLevel.Error);
  });
});

describe('logErrorWith', () => {
  it('emits at Error with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = contextOf('ch', { reqId: '1' });
    logErrorWith(state, 0, ctx, 'fail');
    expect(entries[0]).toMatchObject({ level: LogLevel.Error, data: { msg: 'fail', reqId: '1' } });
  });
});

describe('logInfo', () => {
  it('emits at LogLevel.Info', () => {
    const { entries } = recordingSink();
    logInfo(state, 0, 'i');
    expect(entries[0].level).toBe(LogLevel.Info);
  });
});

describe('logInfoWith', () => {
  it('emits at Info with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = contextOf('ch', { v: 2 });
    logInfoWith(state, 0, ctx, { extra: true });
    expect(entries[0].data).toMatchObject({ v: 2, extra: true });
  });
});

describe('logOnce', () => {
  it('emits only the first time for a given key', () => {
    const { entries } = recordingSink();
    logOnce(state, 0, 'key1', LogLevel.Warn, 'first');
    logOnce(state, 0, 'key1', LogLevel.Warn, 'second');
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toBe('first');
  });

  it('allows different keys to emit independently', () => {
    const { entries } = recordingSink();
    logOnce(state, 0, 'key2a', LogLevel.Info, 'a');
    logOnce(state, 0, 'key2b', LogLevel.Info, 'b');
    expect(entries).toHaveLength(2);
  });

  it('returns true on first emit, false on subsequent calls', () => {
    recordingSink();
    expect(logOnce(state, 0, 'key3', LogLevel.Info, 'x')).toBe(true);
    expect(logOnce(state, 0, 'key3', LogLevel.Info, 'x')).toBe(false);
  });
});

describe('logVerbose', () => {
  it('emits at LogLevel.Verbose', () => {
    const { entries } = recordingSink();
    logVerbose(state, 0, 'v');
    expect(entries[0].level).toBe(LogLevel.Verbose);
  });
});

describe('logVerboseWith', () => {
  it('emits at Verbose with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = contextOf(null, { trace: true });
    logVerboseWith(state, 0, ctx, 'trace-msg');
    expect(entries[0].data).toMatchObject({ msg: 'trace-msg', trace: true });
  });
});

describe('logWarn', () => {
  it('emits at LogLevel.Warn', () => {
    const { entries } = recordingSink();
    logWarn(state, 0, 'w');
    expect(entries[0].level).toBe(LogLevel.Warn);
  });
});

describe('logWarnWith', () => {
  it('emits at Warn with merged context fields', () => {
    const { entries } = recordingSink();
    const ctx = contextOf('ch', { ctx: 'val' });
    logWarnWith(state, 0, ctx, 'warning');
    expect(entries[0].data).toMatchObject({ msg: 'warning', ctx: 'val' });
  });
});

describe('logWith', () => {
  it('emits at the given level with channel from context', () => {
    const { entries } = recordingSink();
    const ctx = contextOf('render', { frame: 1 });
    logWith(state, 0, ctx, LogLevel.Info, 'update');
    expect(entries[0]).toMatchObject({ level: LogLevel.Info, channel: 'render', data: { msg: 'update', frame: 1 } });
  });

  it('passes record data through with fields merged', () => {
    const { entries } = recordingSink();
    const ctx = contextOf(null, { base: 1 });
    logWith(state, 0, ctx, LogLevel.Debug, { extra: 2 });
    expect(entries[0].data).toEqual({ base: 1, extra: 2 });
  });

  it('accepts a lazy provider', () => {
    const { entries } = recordingSink();
    const ctx = contextOf(null);
    logWith(state, 0, ctx, LogLevel.Info, () => 'lazy');
    expect(entries[0].data).toBe('lazy');
  });

  it('gates on the context channel level', () => {
    const { entries } = recordingSink();
    setLogChannelLevel(state, 'quiet', LogLevel.Error);
    logWith(state, 0, contextOf('quiet'), LogLevel.Info, 'suppressed');
    expect(entries).toHaveLength(0);
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
    registerLogSerializer(state, 'acme.Point', (v) => {
      const p = v as { x: number; y: number };
      return { serialized: `(${p.x},${p.y})` };
    });
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { pt: { __kind: 'acme.Point', x: 3, y: 4 } })));
    expect(result.data.pt).toEqual({ serialized: '(3,4)' });
  });

  it('preserves values that do not match a registered serializer', () => {
    registerLogSerializer(state, 'acme.Known', () => ({ serialized: true }));
    const fmt = createJsonLogFormatter(state);
    const data = {
      missingKind: { value: 1 },
      nullValue: null,
      numericKind: { __kind: 7, value: 2 },
      primitive: 3,
      unknownKind: { __kind: 'acme.Unknown', value: 4 },
    };

    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, data)));

    expect(result.data).toEqual(data);
  });
});

describe('removeLogSink', () => {
  it('removes a previously added sink and returns true', () => {
    const entries: LogEntry[] = [];
    const sink = (e: Readonly<LogEntry>): void => {
      entries.push({ ...e });
    };
    addLogSink(state, sink);
    const removed = removeLogSink(state, sink);
    expect(removed).toBe(true);
    log(state, 0, LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });

  it('returns false when the sink was not registered', () => {
    const sink = (): void => {};
    expect(removeLogSink(state, sink)).toBe(false);
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

  it('omits the stack when an Error has no stack value', () => {
    const error = new Error('without stack');
    error.stack = undefined;

    expect(serializeLogError(error)).toEqual({ message: 'without stack', name: 'Error' });
  });
});

describe('setLogChannelLevel', () => {
  it('suppresses entries below the channel level', () => {
    const { entries } = recordingSink();
    setLogChannelLevel(state, 'render', LogLevel.Error);
    log(state, 0, LogLevel.Info, 'info on render channel', 'render');
    log(state, 0, LogLevel.Error, 'error on render channel', 'render');
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe(LogLevel.Error);
  });

  it('does not affect other channels', () => {
    const { entries } = recordingSink();
    setLogChannelLevel(state, 'render', LogLevel.Error);
    log(state, 0, LogLevel.Info, 'other', 'audio');
    expect(entries).toHaveLength(1);
  });
});

describe('setLogConsoleLevel', () => {
  it('raises the threshold so finer levels print a human line', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogConsoleLevel(state, LogLevel.Verbose);
    setLogSink(state, createConsoleCaptureSink(state));
    log(state, 0, LogLevel.Verbose, 'now shown');
    expect(consoleLog).toHaveBeenCalledTimes(1);
  });
});

describe('setLogLevel', () => {
  it('suppresses entries below the global level', () => {
    const { entries } = recordingSink();
    setLogLevel(state, LogLevel.Error);
    log(state, 0, LogLevel.Info, 'suppressed');
    log(state, 0, LogLevel.Error, 'emitted');
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toBe('emitted');
  });

  it('LogLevel.None always suppresses (never-emit guard)', () => {
    const { entries } = recordingSink();
    setLogLevel(state, LogLevel.None);
    log(state, 0, LogLevel.None, 'should not emit');
    expect(entries).toHaveLength(0);
  });
});

describe('setLogRedactionPaths', () => {
  it('replaces top-level fields matching a path', () => {
    setLogRedactionPaths(state, ['password']);
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { user: 'alice', password: 'secret' })));
    expect(result.data.password).toBe('[REDACTED]');
    expect(result.data.user).toBe('alice');
  });

  it('replaces nested fields with dot-notation paths', () => {
    setLogRedactionPaths(state, ['auth.secret']);
    const fmt = createJsonLogFormatter(state);
    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, { auth: { secret: 'tok', name: 'jwt' } })));
    expect(result.data.auth.secret).toBe('[REDACTED]');
    expect(result.data.auth.name).toBe('jwt');
  });

  it('does not mutate the original data object (alias-safe)', () => {
    setLogRedactionPaths(state, ['key']);
    const original = { key: 'value', other: 'safe' };
    const fmt = createJsonLogFormatter(state);
    fmt(entryOf(LogLevel.Info, null, original));
    // The original object should not be mutated
    expect(original.key).toBe('value');
  });

  it('leaves absent and non-record path segments unchanged', () => {
    setLogRedactionPaths(state, ['missing.secret', 'nullValue.secret', 'primitive.secret', 'items.secret']);
    const data = { items: ['secret'], nullValue: null, primitive: 7 };
    const fmt = createJsonLogFormatter(state);

    const result = JSON.parse(fmt(entryOf(LogLevel.Info, null, data)));

    expect(result.data).toEqual(data);
  });

  it('copies the paths so later edits to the input array do not apply', () => {
    const paths = ['password'];
    setLogRedactionPaths(state, paths);
    paths.push('user');
    const result = JSON.parse(
      createJsonLogFormatter(state)(entryOf(LogLevel.Info, null, { user: 'alice', password: 'pw' })),
    );
    expect(result.data.user).toBe('alice');
  });
});

describe('setLogSink', () => {
  it('clears the sink list when passed null', () => {
    const { entries } = recordingSink();
    setLogSink(state, null);
    log(state, 0, LogLevel.Info, 'x');
    expect(entries).toHaveLength(0);
  });

  it('replaces all existing sinks with the single given sink', () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    addLogSink(state, (e) => a.push({ ...e }));
    setLogSink(state, (e) => b.push({ ...e }));
    log(state, 0, LogLevel.Info, 'x');
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });
});

describe('severity wrapper providers and gates', () => {
  it('does not evaluate any provider when its level is suppressed', () => {
    const { entries } = recordingSink();
    const context = contextOf('channel');
    const providers = Array.from({ length: 12 }, (_, index) => vi.fn(() => `value-${index}`));
    setLogLevel(state, LogLevel.None);

    logAssert(state, 0, false, providers[0]);
    logDebug(state, 0, providers[1]);
    logDebugWith(state, 0, context, providers[2]);
    logError(state, 0, providers[3]);
    logErrorWith(state, 0, context, providers[4]);
    logInfo(state, 0, providers[5]);
    logInfoWith(state, 0, context, providers[6]);
    logVerbose(state, 0, providers[7]);
    logVerboseWith(state, 0, context, providers[8]);
    logWarn(state, 0, providers[9]);
    logWarnWith(state, 0, context, providers[10]);
    logWith(state, 0, context, LogLevel.Info, providers[11]);

    for (const provider of providers) expect(provider).not.toHaveBeenCalled();
    expect(entries).toHaveLength(0);
  });

  it('evaluates providers after their level gates pass', () => {
    const { entries } = recordingSink();
    const context = contextOf('channel');
    const providers = Array.from({ length: 10 }, (_, index) => vi.fn(() => `value-${index}`));

    logAssert(state, 0, false, providers[0]);
    logDebugWith(state, 0, context, providers[1]);
    logError(state, 0, providers[2]);
    logErrorWith(state, 0, context, providers[3]);
    logInfo(state, 0, providers[4]);
    logInfoWith(state, 0, context, providers[5]);
    logVerbose(state, 0, providers[6]);
    logVerboseWith(state, 0, context, providers[7]);
    logWarn(state, 0, providers[8]);
    logWarnWith(state, 0, context, providers[9]);

    for (const provider of providers) expect(provider).toHaveBeenCalledTimes(1);
    expect(entries.map((entry) => (typeof entry.data === 'string' ? entry.data : entry.data.msg))).toEqual(
      providers.map((_, index) => `value-${index}`),
    );
  });
});

describe('startLogTimer', () => {
  it('returns a LogTimer with the given label, channel, and start time', () => {
    const timer = startLogTimer('render', 'perf', 12.5);
    expect(timer).toEqual({ label: 'render', channel: 'perf', startedAt: 12.5 });
  });

  it('records the injected time without reading a clock', () => {
    const now = vi.spyOn(Date, 'now');
    const performanceNow = vi.spyOn(performance, 'now');

    expect(startLogTimer('injected', null, 1234).startedAt).toBe(1234);
    expect(now).not.toHaveBeenCalled();
    expect(performanceNow).not.toHaveBeenCalled();
  });
});
