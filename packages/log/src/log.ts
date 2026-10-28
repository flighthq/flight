import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  BufferedLogSink,
  Entity,
  LogContext,
  LogData,
  LogDataProvider,
  LogEntry,
  LogFormatter,
  LogSignals,
  LogSink,
  LogSpan,
  LogTimer,
  MemoryLogSink,
  RateLimitedLogSink,
} from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

// Logging is split into two faces of one contract so each consumer tree-shakes its half:
//
//   Emit side  — log and the log* wrappers. Featherweight: each checks the level gate and
//                forwards an entry to the state's sinks. A build that never installs a sink
//                carries only the forwarder and the LogLevel enum; the listener-side code
//                tree-shakes away.
//   Listener side — sink management (addLogSink / removeLogSink), formatters, and sink
//                combinators. Imported by tools (the examples, the capture harness).
//
// Every stateful function takes the caller-owned LogState, and every emit takes the caller's clock
// reading `nowMs`. Nothing here reads a clock, starts a timer, or keeps process-global state: the
// caller decides where a LogState lives and how it is shared.

// Options for createBufferedLogSink. `size` is the batch size that triggers a flush (default 100);
// `intervalMs` is how much advanceLogSink time may pass between flushes (default 1000).
export interface BufferedLogSinkOptions {
  size?: number;
  intervalMs?: number;
}

// Either direct data or a lazy provider, resolved only once the entry passes the level gate.
export type LogDataOrProvider = LogData | LogDataProvider;

// A sink predicate for createFilterLogSink.
export type LogPredicate = (entry: Readonly<LogEntry>) => boolean;

// A custom serializer for one `__kind`, registered with registerLogSerializer.
export type LogSerializer = (value: Readonly<Record<string, unknown>>) => Record<string, unknown>;

// Everything logging needs between calls, owned by the caller: sinks, levels, once keys, redaction
// paths, serializers, group depth, active spans and the signals group. Pass it to every stateful
// function. Share one state to share one log; create another to isolate (a test, a worker, a tool).
export interface LogState extends Entity {
  sinks: LogSink[];
  level: LogLevel;
  consoleLevel: LogLevel;
  channelLevels: Map<string, LogLevel>;
  onceKeys: Set<string>;
  redactionPaths: string[];
  serializers: Map<string, LogSerializer>;
  groupDepth: number;
  spans: LogSpan[];
  signals: LogSignals | null;
  nextSpanId: number;
}

// Options for createRateLimitedLogSink. The window is measured on each entry's `timestampMs`.
export interface RateLimitedLogSinkOptions {
  perChannel?: boolean;
  maxPerInterval: number;
  intervalMs: number;
}

// Options for createTextLogFormatter.
export interface TextLogFormatterOptions {
  indentGroups?: boolean;
  levelPrefix?: boolean;
  timestamp?: boolean;
}

// Listener side. Adds a sink to the fan-out list. No-op if already present.
export function addLogSink(state: LogState, sink: LogSink): void {
  if (state.sinks.includes(sink)) return;
  state.sinks.push(sink);
}

// Advances a buffered sink's clock. When at least `intervalMs` has passed since the last flush it
// flushes the queued entries. The first call only starts the interval. This replaces a hidden
// interval timer: the caller ticks the sink from whatever loop it already runs.
export function advanceLogSink(handle: BufferedLogSink, nowMs: number): void {
  const state = _bufferedSinkStates.get(handle);
  if (!state) return;
  if (state.lastFlushMs === null) {
    state.lastFlushMs = nowMs;
    return;
  }
  if (nowMs - state.lastFlushMs < state.intervalMs) return;
  state.lastFlushMs = nowMs;
  _flushBufferedState(state);
}

// Opens a named log group. All entries emitted while the group is open carry a `depth` field in
// their structured data and the text formatter will indent them. Call endLogGroup to close. Groups
// nest: each beginLogGroup increments the depth, endLogGroup decrements it.
export function beginLogGroup(state: LogState, nowMs: number, label: string, channel: string | null = null): void {
  state.groupDepth++;
  if (!_passesLevelGate(state, LogLevel.Debug, channel)) return;
  _emitToSinks(state, {
    level: LogLevel.Debug,
    channel,
    data: { msg: label, group: 'begin', depth: state.groupDepth },
    timestampMs: nowMs,
  });
}

// Listener side. Clears one per-channel level override so the channel inherits the global level.
export function clearLogChannelLevel(state: LogState, channel: string): void {
  state.channelLevels.delete(channel);
}

// Listener side. Clears all per-channel level overrides.
export function clearLogChannelLevels(state: LogState): void {
  state.channelLevels.clear();
}

// Resets the group nesting depth to zero without emitting any entries. Useful for test teardown or
// error recovery when normal beginLogGroup / endLogGroup pairing breaks down.
export function clearLogGroups(state: LogState): void {
  state.groupDepth = 0;
}

// Clears the set of keys that logOnce has already emitted, so subsequent calls with those keys will
// fire again.
export function clearLogOnceKeys(state: LogState): void {
  state.onceKeys.clear();
}

// Clears all field redaction paths set by setLogRedactionPaths.
export function clearLogRedactionPaths(state: LogState): void {
  state.redactionPaths.length = 0;
}

// Clears all custom serializer registrations set by registerLogSerializer.
export function clearLogSerializers(state: LogState): void {
  state.serializers.clear();
}

// Listener side. Clears all installed sinks.
export function clearLogSinks(state: LogState): void {
  state.sinks.length = 0;
}

// Clears all captured entries from a memory sink.
export function clearMemoryLogSink(handle: MemoryLogSink): void {
  const state = _memorySinkStates.get(handle);
  if (!state) return;
  state.buf.length = 0;
  state.head = 0;
}

// Creates a sink that batches entries and forwards them to `target` in bulk. The buffer flushes
// when it reaches `size` entries, when advanceLogSink sees `intervalMs` elapse, or on flushLogSink /
// disposeLogSink.
export function createBufferedLogSink(target: LogSink, options?: Readonly<BufferedLogSinkOptions>): BufferedLogSink {
  const out = allocateEntity<BufferedLogSink>();
  initializeBufferedLogSink(out, target, options);
  return finishEntity(out);
}

// Creates a child context that inherits the parent's channel and fields. The child wins on key
// collision. An explicit channel overrides the parent's channel.
export function createChildLogContext(
  parent: Readonly<LogContext>,
  fields: Readonly<Record<string, unknown>>,
  channel?: string | null,
): LogContext {
  const out = createLogContext();
  out.channel = channel !== undefined ? channel : parent.channel;
  out.fields = { ...parent.fields, ...fields };
  return out;
}

// Creates a fan-out sink that forwards every entry to all supplied sinks.
export function createFanoutLogSink(sinks: readonly LogSink[]): LogSink {
  const list = sinks.slice();
  return (entry: Readonly<LogEntry>): void => {
    for (const s of list) s(entry);
  };
}

// Creates a sink that forwards only entries matching a predicate. Compose with addLogSink to give
// each target its own independent filter (per-sink level, per-channel filter, etc.).
export function createFilterLogSink(target: LogSink, predicate: LogPredicate): LogSink {
  return (entry: Readonly<LogEntry>): void => {
    if (predicate(entry)) target(entry);
  };
}

// Creates a formatter that produces the `__flight` JSON envelope used by the capture harness.
// Field redaction (setLogRedactionPaths) and custom serializers (registerLogSerializer) are read
// from `state` at format time; the envelope's `t` is the entry's own timestamp.
export function createJsonLogFormatter(state: Readonly<LogState>): LogFormatter {
  return (entry: Readonly<LogEntry>): string => {
    const { level, channel, data } = entry;
    const serialized = _applySerializers(
      state,
      typeof data === 'string' ? { msg: data } : (data as Record<string, unknown>),
    );
    const redacted = state.redactionPaths.length > 0 ? _applyRedaction(state, serialized) : serialized;
    return JSON.stringify({
      __flight: true,
      t: entry.timestampMs,
      level: _levelNames[level],
      channel,
      data: redacted,
    });
  };
}

// Creates an empty bound logging context: no channel and no base fields. Assign `channel` and
// `fields`, then pass it to logWith / logErrorWith / etc. to merge them into every entry.
export function createLogContext(): LogContext {
  const out = allocateEntity<LogContext>();
  initializeLogContext(out);
  return finishEntity(out);
}

// Creates a tracing span with the next span id from `state` and an empty name, channel and fields.
// Assign those, then enterLogSpan to activate it. While active, the span's fields are merged into
// every emitted entry (span fields have lower priority than direct emit fields). enterLogSpan /
// exitLogSpan are stack-based: multiple spans can be active simultaneously; the most recently
// entered span wins on field key collision.
export function createLogSpan(state: LogState): LogSpan {
  const out = allocateEntity<LogSpan>();
  initializeLogSpan(out, state);
  return finishEntity(out);
}

// Creates a fresh caller-owned log state: no sinks, global level Verbose, console level Info.
export function createLogState(): LogState {
  const out = allocateEntity<LogState>();
  initializeLogState(out);
  return finishEntity(out);
}

// Creates a sink that captures the last `capacity` entries in a ring buffer. Use
// getMemoryLogSinkEntries to read (oldest-first) and clearMemoryLogSink to reset.
export function createMemoryLogSink(capacity: number): MemoryLogSink {
  const out = allocateEntity<MemoryLogSink>();
  initializeMemoryLogSink(out, capacity);
  return finishEntity(out);
}

// Creates a sink that forwards at most `maxPerInterval` entries per `intervalMs` window, measured on
// each entry's `timestampMs`. When `perChannel` is true, the budget is tracked per channel.
export function createRateLimitedLogSink(
  target: LogSink,
  options: Readonly<RateLimitedLogSinkOptions>,
): RateLimitedLogSink {
  const out = allocateEntity<RateLimitedLogSink>();
  initializeRateLimitedLogSink(out, target, options);
  return finishEntity(out);
}

// Creates a sink that forwards approximately 1-in-N entries (probability = 1 / rate when rate > 1).
export function createSampledLogSink(target: LogSink, rate: number): LogSink {
  if (rate <= 1) return (entry: Readonly<LogEntry>): void => target(entry);
  let counter = 0;
  return (entry: Readonly<LogEntry>): void => {
    counter = (counter + 1) % rate;
    if (counter === 0) target(entry);
  };
}

// Creates a formatter that produces a human-readable `[channel] message` line. When `indentGroups`
// is true the formatter indents the message by `state`'s current group depth; `timestamp` prints the
// entry's own timestamp.
export function createTextLogFormatter(
  state: Readonly<LogState>,
  options?: Readonly<TextLogFormatterOptions>,
): LogFormatter {
  const indentGroups = options?.indentGroups ?? false;
  const levelPrefix = options?.levelPrefix ?? false;
  const timestamp = options?.timestamp ?? false;
  return (entry: Readonly<LogEntry>): string => {
    const { level, channel, data } = entry;
    const parts: string[] = [];
    if (timestamp) parts.push(`t=${entry.timestampMs.toFixed(2)}`);
    if (levelPrefix) parts.push(_levelNames[level] ?? 'unknown');
    parts.push(channel !== null ? `[${channel}]` : '[flight]');
    if (indentGroups && state.groupDepth > 0) parts.push('  '.repeat(state.groupDepth));
    if (typeof data === 'string') parts.push(data);
    else parts.push(JSON.stringify(data));
    return parts.join(' ');
  };
}

// Disposes a buffered sink: flushes remaining entries. The sink stays callable afterwards.
export function disposeLogSink(handle: BufferedLogSink): void {
  const state = _bufferedSinkStates.get(handle);
  if (state) _flushBufferedState(state);
}

// Enables the log signals group on `state`. Calling it again returns the same LogSignals. Tree-shakes
// away unless this function is called. The signals are emitted synchronously in the fan-out path.
export function enableLogSignals(state: LogState): LogSignals {
  if (state.signals !== null) return state.signals;
  const signals = allocateEntity<LogSignals>();
  signals.onLogEntry = createSignal<(entry: Readonly<LogEntry>) => void>();
  signals.onLogError = createSignal<(entry: Readonly<LogEntry>) => void>();
  state.signals = finishEntity(signals);
  return state.signals;
}

// Closes the innermost open log group (decrements nesting depth). Emits a Debug entry marking
// the group end. No-op if no group is open.
export function endLogGroup(state: LogState, nowMs: number, channel: string | null = null): void {
  if (state.groupDepth <= 0) return;
  state.groupDepth--;
  if (!_passesLevelGate(state, LogLevel.Debug, channel)) return;
  _emitToSinks(state, {
    level: LogLevel.Debug,
    channel,
    data: { group: 'end', depth: state.groupDepth + 1 },
    timestampMs: nowMs,
  });
}

// Ends a timer, emits a structured Debug entry with the elapsed milliseconds, and returns the
// elapsed time in milliseconds.
export function endLogTimer(state: LogState, nowMs: number, timer: Readonly<LogTimer>): number {
  const elapsed = nowMs - timer.startedAt;
  logDebug(state, nowMs, { label: timer.label, elapsedMs: elapsed }, timer.channel);
  return elapsed;
}

// Activates a log span, pushing it onto the active-span stack. While active, the span's fields
// are merged into every emitted entry. The span with the highest stack index (most recently
// entered) wins on field key collision. Pair every enterLogSpan with exitLogSpan.
export function enterLogSpan(state: LogState, span: Readonly<LogSpan>): void {
  state.spans.push(span as LogSpan);
}

// Deactivates a log span by removing it from the active-span stack. The span need not be the
// topmost — it is removed by id from wherever it appears in the stack, supporting both strict LIFO
// and out-of-order unwinding. No-op if the span is not in the stack.
export function exitLogSpan(state: LogState, span: Readonly<LogSpan>): void {
  const index = state.spans.findIndex((active) => active.id === span.id);
  if (index >= 0) state.spans.splice(index, 1);
}

// Flushes a buffered sink immediately, forwarding all queued entries to its target.
export function flushLogSink(handle: BufferedLogSink): void {
  const state = _bufferedSinkStates.get(handle);
  if (state) _flushBufferedState(state);
}

// Listener side. Per-channel level override. Returns null when no channel-specific level is set
// (the channel inherits the global level).
export function getLogChannelLevel(state: Readonly<LogState>, channel: string): LogLevel | null {
  return state.channelLevels.get(channel) ?? null;
}

// Listener side. Reads the human-readable console threshold (default LogLevel.Info). Capture is
// unaffected by it — the console-capture sink records every level regardless.
export function getLogConsoleLevel(state: Readonly<LogState>): LogLevel {
  return state.consoleLevel;
}

// Listener side. Reads the global minimum emit level (default LogLevel.Verbose — emit everything).
// Lower-priority levels (higher numeric value) are suppressed before any sink work.
export function getLogLevel(state: Readonly<LogState>): LogLevel {
  return state.level;
}

// Listener side. Returns the canonical lowercase name for a LogLevel value.
export function getLogLevelName(level: LogLevel): string {
  return _levelNames[level] ?? 'unknown';
}

// Writes the captured log entries from a memory sink into `out` (cleared first) in insertion order
// (oldest-first).
export function getMemoryLogSinkEntries(out: LogEntry[], handle: Readonly<MemoryLogSink>): void {
  out.length = 0;
  const state = _memorySinkStates.get(handle as MemoryLogSink);
  if (!state) return;
  const { buf, head } = state;
  for (let i = head; i < buf.length; i++) out.push(buf[i]);
  for (let i = 0; i < head; i++) out.push(buf[i]);
}

// Writes a buffered sink over `target` into `out` (the construction initializer of
// createBufferedLogSink).
export function initializeBufferedLogSink(
  out: EntityConstruction<BufferedLogSink>,
  target: LogSink,
  options?: Readonly<BufferedLogSinkOptions>,
): void {
  const state: BufferedLogSinkState = {
    buf: [],
    intervalMs: options?.intervalMs ?? 1000,
    lastFlushMs: null,
    size: options?.size ?? 100,
    target,
  };
  (out as { sink: LogSink }).sink = (entry: Readonly<LogEntry>): void => {
    state.buf.push(_copyLogEntry(entry));
    if (state.buf.length >= state.size) _flushBufferedState(state);
  };
  _bufferedSinkStates.set(out as BufferedLogSink, state);
}

// Resets a context to no channel and no base fields (the construction initializer of
// createLogContext).
export function initializeLogContext(out: EntityConstruction<LogContext>): void {
  out.channel = null;
  out.fields = {};
}

// Gives `out` the next span id from `state` and an empty name, channel and fields (the construction
// initializer of createLogSpan).
export function initializeLogSpan(out: EntityConstruction<LogSpan>, state: LogState): void {
  out.id = state.nextSpanId++;
  out.name = '';
  out.channel = null;
  out.fields = {};
}

// Resets `out` to a fresh log state (the construction initializer of createLogState).
export function initializeLogState(out: EntityConstruction<LogState>): void {
  out.sinks = [];
  out.level = LogLevel.Verbose;
  out.consoleLevel = LogLevel.Info;
  out.channelLevels = new Map();
  out.onceKeys = new Set();
  out.redactionPaths = [];
  out.serializers = new Map();
  out.groupDepth = 0;
  out.spans = [];
  out.signals = null;
  out.nextSpanId = 1;
}

// Writes an empty ring buffer of `capacity` entries into `out` (the construction initializer of
// createMemoryLogSink).
export function initializeMemoryLogSink(out: EntityConstruction<MemoryLogSink>, capacity: number): void {
  const state: MemoryLogSinkState = { buf: [], head: 0 };
  (out as { sink: LogSink }).sink = (entry: Readonly<LogEntry>): void => {
    const stored = _copyLogEntry(entry);
    if (state.buf.length < capacity) {
      state.buf.push(stored);
    } else {
      state.buf[state.head] = stored;
      state.head = (state.head + 1) % capacity;
    }
  };
  _memorySinkStates.set(out as MemoryLogSink, state);
}

// Writes a rate-limited sink over `target` into `out` (the construction initializer of
// createRateLimitedLogSink).
export function initializeRateLimitedLogSink(
  out: EntityConstruction<RateLimitedLogSink>,
  target: LogSink,
  options: Readonly<RateLimitedLogSinkOptions>,
): void {
  const perChannel = options.perChannel ?? false;
  const { maxPerInterval, intervalMs } = options;
  const counts = new Map<string | null, number>();
  let windowStartMs: number | null = null;
  (out as { sink: LogSink }).sink = (entry: Readonly<LogEntry>): void => {
    const now = entry.timestampMs;
    if (windowStartMs === null) {
      windowStartMs = now;
    } else if (now - windowStartMs >= intervalMs) {
      counts.clear();
      windowStartMs = now;
    }
    const key = perChannel ? entry.channel : null;
    const current = counts.get(key) ?? 0;
    if (current >= maxPerInterval) return;
    counts.set(key, current + 1);
    target(entry);
  };
}

// Emit side. Emits a log entry at an explicit level. `channel` is a free categorization tag
// (e.g. 'batch', 'shader', 'user') for filtering captured output. Accepts a plain LogData value
// or a LogDataProvider thunk — the thunk is not called unless the entry passes the level gate,
// making suppressed verbose calls allocation-free. No-ops when no sinks are installed or when
// the global or per-channel level gate suppresses the entry.
export function log(
  state: LogState,
  nowMs: number,
  level: LogLevel,
  data: LogDataOrProvider,
  channel: string | null = null,
): void {
  if (!_passesLevelGate(state, level, channel)) return;
  _emitToSinks(state, { level, channel, data: _mergeSpanFields(state, _resolveData(data)), timestampMs: nowMs });
}

// Emit side. Emits an Error-level entry only when condition is false. Never throws — sentinel
// behavior for assertion-style diagnostics.
export function logAssert(
  state: LogState,
  nowMs: number,
  condition: boolean,
  data: LogDataOrProvider,
  channel: string | null = null,
): void {
  if (condition) return;
  log(state, nowMs, LogLevel.Error, data, channel);
}

// Emit side. Severity-named convenience wrappers over log (mirrors console.debug/info/warn/error).
export function logDebug(state: LogState, nowMs: number, data: LogDataOrProvider, channel: string | null = null): void {
  log(state, nowMs, LogLevel.Debug, data, channel);
}

export function logDebugWith(
  state: LogState,
  nowMs: number,
  context: Readonly<LogContext>,
  data: LogDataOrProvider,
): void {
  logWith(state, nowMs, context, LogLevel.Debug, data);
}

export function logError(state: LogState, nowMs: number, data: LogDataOrProvider, channel: string | null = null): void {
  log(state, nowMs, LogLevel.Error, data, channel);
}

export function logErrorWith(
  state: LogState,
  nowMs: number,
  context: Readonly<LogContext>,
  data: LogDataOrProvider,
): void {
  logWith(state, nowMs, context, LogLevel.Error, data);
}

export function logInfo(state: LogState, nowMs: number, data: LogDataOrProvider, channel: string | null = null): void {
  log(state, nowMs, LogLevel.Info, data, channel);
}

export function logInfoWith(
  state: LogState,
  nowMs: number,
  context: Readonly<LogContext>,
  data: LogDataOrProvider,
): void {
  logWith(state, nowMs, context, LogLevel.Info, data);
}

// Emit side. Emits a given key at most once per LogState (useful for warmup warnings and deprecation
// notices). Returns true if the entry was emitted, false if it was suppressed.
export function logOnce(
  state: LogState,
  nowMs: number,
  key: string,
  level: LogLevel,
  data: LogDataOrProvider,
  channel: string | null = null,
): boolean {
  if (state.onceKeys.has(key)) return false;
  state.onceKeys.add(key);
  log(state, nowMs, level, data, channel);
  return true;
}

export function logVerbose(
  state: LogState,
  nowMs: number,
  data: LogDataOrProvider,
  channel: string | null = null,
): void {
  log(state, nowMs, LogLevel.Verbose, data, channel);
}

export function logVerboseWith(
  state: LogState,
  nowMs: number,
  context: Readonly<LogContext>,
  data: LogDataOrProvider,
): void {
  logWith(state, nowMs, context, LogLevel.Verbose, data);
}

export function logWarn(state: LogState, nowMs: number, data: LogDataOrProvider, channel: string | null = null): void {
  log(state, nowMs, LogLevel.Warn, data, channel);
}

export function logWarnWith(
  state: LogState,
  nowMs: number,
  context: Readonly<LogContext>,
  data: LogDataOrProvider,
): void {
  logWith(state, nowMs, context, LogLevel.Warn, data);
}

// Emit side. Emits a log entry using the bound channel and merged fields from a LogContext. The
// context's fields are merged into the entry's data (string data becomes { msg, ...fields }).
export function logWith(
  state: LogState,
  nowMs: number,
  context: Readonly<LogContext>,
  level: LogLevel,
  data: LogDataOrProvider,
): void {
  const { channel } = context;
  if (!_passesLevelGate(state, level, channel)) return;
  _emitToSinks(state, {
    level,
    channel,
    data: _mergeContextFields(context, _mergeSpanFields(state, _resolveData(data))),
    timestampMs: nowMs,
  });
}

// Listener side. Parses a level name (case-insensitive) back to a LogLevel. Returns null for
// unknown names (sentinel, not a throw).
export function parseLogLevel(name: string): LogLevel | null {
  return _levelByName.get(name.toLowerCase()) ?? null;
}

// Registers a custom serializer for a named kind. When the JSON formatter encounters a field
// value whose `__kind` property matches `kind`, it calls `serializer` to convert the value to a plain
// record. Kind strings follow the `*Kind`-style string registry: last-write-wins; vendor-prefix
// custom kinds (e.g. 'acme.Foo') to avoid collisions with built-in kinds (bare names reserved).
export function registerLogSerializer(state: LogState, kind: string, serializer: LogSerializer): void {
  state.serializers.set(kind, serializer);
}

// Listener side. Removes a sink from the fan-out list. Returns false if not present (sentinel,
// not a throw).
export function removeLogSink(state: LogState, sink: LogSink): boolean {
  const index = state.sinks.indexOf(sink);
  if (index < 0) return false;
  state.sinks.splice(index, 1);
  return true;
}

// Extracts name/message/stack/cause from an Error (recursively) into a plain record suitable
// for JSON serialization. Pass the result as LogData to capture stack traces correctly.
export function serializeLogError(value: unknown): Record<string, unknown> {
  if (!(value instanceof Error)) return { value: String(value) };
  const result: Record<string, unknown> = {
    name: value.name,
    message: value.message,
  };
  if (value.stack !== undefined) result.stack = value.stack;
  if (value.cause !== undefined) result.cause = serializeLogError(value.cause);
  return result;
}

// Listener side. Sets a per-channel minimum emit level. Resolution order: channel level if set,
// else global level. Use getLogChannelLevel to read, clearLogChannelLevels to reset.
export function setLogChannelLevel(state: LogState, channel: string, level: LogLevel): void {
  state.channelLevels.set(channel, level);
}

// Listener side. Sets the highest level printed as a human-readable console line by the capture
// sink. LogLevel.None silences those lines; the capture record still receives every level.
export function setLogConsoleLevel(state: LogState, level: LogLevel): void {
  state.consoleLevel = level;
}

// Listener side. Sets the global minimum emit level. Entries below this level are suppressed
// before any sink work, making suppressed verbose logging genuinely free in hot paths.
export function setLogLevel(state: LogState, level: LogLevel): void {
  state.level = level;
}

// Sets the redaction paths applied by the JSON formatter. Paths use dot notation to target
// nested fields (e.g. ['headers.authorization', 'user.token']). Matching field values are
// replaced with '[REDACTED]'. Pass an empty array to disable redaction.
export function setLogRedactionPaths(state: LogState, paths: readonly string[]): void {
  state.redactionPaths.length = 0;
  for (const p of paths) state.redactionPaths.push(p);
}

// Installs (or clears, with null) the single sink — clears the list then adds the new sink if
// non-null.
export function setLogSink(state: LogState, sink: LogSink | null): void {
  state.sinks.length = 0;
  if (sink !== null) state.sinks.push(sink);
}

// Starts a named timer at the caller's clock reading `nowMs`. Pass the returned LogTimer to
// endLogTimer to record elapsed time and emit a structured Debug entry.
export function startLogTimer(label: string, channel: string | null, nowMs: number): LogTimer {
  return { label, channel, startedAt: nowMs };
}

interface BufferedLogSinkState {
  buf: LogEntry[];
  intervalMs: number;
  lastFlushMs: number | null;
  size: number;
  target: LogSink;
}

interface MemoryLogSinkState {
  buf: LogEntry[];
  head: number;
}

// Per-handle private sink state, keyed by the handle so it is collected with it. The handle's public
// shape stays `{ sink }`; nothing outside this module can reach the queue or the ring buffer.
const _bufferedSinkStates = new WeakMap<BufferedLogSink, BufferedLogSinkState>();
const _memorySinkStates = new WeakMap<MemoryLogSink, MemoryLogSinkState>();

const _levelNames: Readonly<Record<LogLevel, string>> = {
  [LogLevel.None]: 'none',
  [LogLevel.Error]: 'error',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Info]: 'info',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Verbose]: 'verbose',
};

const _levelByName: ReadonlyMap<string, LogLevel> = new Map<string, LogLevel>([
  ['none', LogLevel.None],
  ['error', LogLevel.Error],
  ['warn', LogLevel.Warn],
  ['info', LogLevel.Info],
  ['debug', LogLevel.Debug],
  ['verbose', LogLevel.Verbose],
]);

// Applies dot-notation redaction paths to a record, replacing matching values with '[REDACTED]'.
function _applyRedaction(state: Readonly<LogState>, data: Record<string, unknown>): Record<string, unknown> {
  // Shallow copy at root; only deep-copy when traversal requires it.
  const result = { ...data };
  for (const path of state.redactionPaths) {
    _redactPath(result, path.split('.'), 0);
  }
  return result;
}

// Applies registered serializers to values whose `__kind` matches a registered kind.
function _applySerializers(state: Readonly<LogState>, data: Record<string, unknown>): Record<string, unknown> {
  if (state.serializers.size === 0) return data;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      '__kind' in value &&
      typeof (value as Record<string, unknown>).__kind === 'string'
    ) {
      const serializer = state.serializers.get((value as Record<string, unknown>).__kind as string);
      result[key] = serializer ? serializer(value as Record<string, unknown>) : value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Sinks that hold entries past the call keep their own copy, so a caller reusing an entry object
// cannot rewrite what was captured.
function _copyLogEntry(entry: Readonly<LogEntry>): LogEntry {
  return { level: entry.level, channel: entry.channel, data: entry.data, timestampMs: entry.timestampMs };
}

function _emitToSinks(state: Readonly<LogState>, entry: Readonly<LogEntry>): void {
  for (const sink of state.sinks) sink(entry);
  const signals = state.signals;
  if (signals !== null) {
    emitSignal(signals.onLogEntry, entry);
    if (entry.level === LogLevel.Error) emitSignal(signals.onLogError, entry);
  }
}

function _flushBufferedState(state: BufferedLogSinkState): void {
  if (state.buf.length === 0) return;
  const batch = state.buf.splice(0);
  for (const entry of batch) state.target(entry);
}

function _mergeContextFields(context: Readonly<LogContext>, data: LogData): LogData {
  const { fields } = context;
  if (Object.keys(fields).length === 0) return data;
  if (typeof data === 'string') return { msg: data, ...fields };
  return { ...fields, ...(data as Record<string, unknown>) };
}

// Merges active span fields into emitted data. Span fields have lower priority than data fields;
// later spans in the stack win over earlier ones on key collision within span fields.
function _mergeSpanFields(state: Readonly<LogState>, data: LogData): LogData {
  if (state.spans.length === 0) return data;
  // Accumulate span fields oldest-first so newer spans overwrite older ones.
  const spanFields: Record<string, unknown> = {};
  for (const span of state.spans) {
    Object.assign(spanFields, span.fields);
  }
  if (Object.keys(spanFields).length === 0) return data;
  // Data fields win over span fields on key collision.
  if (typeof data === 'string') return { msg: data, ...spanFields };
  return { ...spanFields, ...(data as Record<string, unknown>) };
}

function _passesLevelGate(state: Readonly<LogState>, level: LogLevel, channel: string | null): boolean {
  if (state.sinks.length === 0 && state.signals === null) return false;
  const channelLevel = channel !== null ? state.channelLevels.get(channel) : undefined;
  const gate = channelLevel ?? state.level;
  return level <= gate && level !== LogLevel.None;
}

function _redactPath(obj: Record<string, unknown>, parts: string[], index: number): void {
  const key = parts[index];
  if (!(key in obj)) return;
  if (index === parts.length - 1) {
    obj[key] = '[REDACTED]';
    return;
  }
  const next = obj[key];
  if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
    // Deep-copy one level before mutating.
    obj[key] = { ...(next as Record<string, unknown>) };
    _redactPath(obj[key] as Record<string, unknown>, parts, index + 1);
  }
}

function _resolveData(data: LogDataOrProvider): LogData {
  return typeof data === 'function' ? data() : data;
}
