import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  BufferedLogSink,
  FileLogSink,
  LogContext,
  LogData,
  LogDataProvider,
  LogEntry,
  LogFormatter,
  LogSignals,
  LogSink,
  LogSpan,
  LogTimer,
  LogTransportBackend,
  MemoryLogSink,
  RateLimitedLogSink,
} from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

// Logging is split into two faces of one contract so each consumer tree-shakes its half:
//
//   Emit side  — log and the log* wrappers. Featherweight: each checks the level gate and
//                forwards an entry to the installed sinks. A build that never installs a sink
//                carries only the forwarder and the LogLevel enum; the listener-side code
//                tree-shakes away.
//   Listener side — createConsoleCaptureSink, sink management (addLogSink / removeLogSink),
//                formatters, and sink combinators. Imported by tools (the examples, the capture
//                harness). This is where levels gate output: each sink records what it wants;
//                the console-capture sink records EVERY level (the machine record is complete)
//                and additionally prints a human console line for levels at or above the
//                configured threshold.

// Listener side. Adds a sink to the fan-out list. No-op if already present.
export function addLogSink(sink: LogSink): void {
  if (_sinks.includes(sink)) return;
  _sinks.push(sink);
}

// Opens a named log group. All entries emitted while the group is open carry a `depth` field in
// their structured data and the text formatter will indent them. Call endLogGroup to close. Groups
// nest: each beginLogGroup increments the depth, endLogGroup decrements it.
export function beginLogGroup(label: string, channel: string | null = null): void {
  _groupDepth++;
  if (!_passesLevelGate(LogLevel.Debug, channel)) return;
  _emitToSinks({ level: LogLevel.Debug, channel, data: { msg: label, group: 'begin', depth: _groupDepth } });
}

// Listener side. Clears all per-channel level overrides.
export function clearLogChannelLevels(): void {
  _channelLevels.clear();
}

// Resets the group nesting depth to zero without emitting any entries. Useful for test teardown or
// error recovery when normal beginLogGroup / endLogGroup pairing breaks down.
export function clearLogGroups(): void {
  _groupDepth = 0;
}

// Clears all field redaction paths set by setLogRedactionPaths.
export function clearLogRedactionPaths(): void {
  _redactionPaths.length = 0;
}

// Clears all custom serializer registrations set by registerLogSerializer.
export function clearLogSerializers(): void {
  _serializers.clear();
}

// Listener side. Clears all installed sinks.
export function clearLogSinks(): void {
  _sinks.length = 0;
}

// Clears all captured entries from a memory sink.
export function clearMemoryLogSink(handle: MemoryLogSink): void {
  const state = _memorySinkStates.get(handle);
  if (!state) return;
  state.buf.length = 0;
  state.head = 0;
}

// Creates a sink that batches entries and forwards them to `target` in bulk. The buffer flushes
// when it reaches `size` entries (default 100) or at `intervalMs` milliseconds (default 1000, 0
// to disable the interval). Use flushLogSink to flush manually, disposeLogSink to cancel the
// interval timer and release the resource.
export function createBufferedLogSink(
  target: LogSink,
  options: { size?: number; intervalMs?: number } = {},
): BufferedLogSink {
  const size = options.size ?? 100;
  const intervalMs = options.intervalMs ?? 1000;

  const flush = (): void => {
    const state = _bufferedSinkStates.get(handle);
    if (!state || state.buf.length === 0) return;
    const batch = state.buf.splice(0);
    for (const entry of batch) target(entry);
  };

  const sink: LogSink = (entry: Readonly<LogEntry>) => {
    const state = _bufferedSinkStates.get(handle);
    if (!state) return;
    state.buf.push({ level: entry.level, channel: entry.channel, data: entry.data });
    if (state.buf.length >= size) flush();
  };

  const handle: BufferedLogSink = { sink };
  let timer: ReturnType<typeof setInterval> | null = null;
  if (intervalMs > 0 && typeof setInterval !== 'undefined') {
    timer = setInterval(flush, intervalMs);
  }
  _bufferedSinkStates.set(handle, { buf: [], timer, flush });
  return handle;
}

// Creates a child context that inherits the parent's channel and fields. The child wins on key
// collision. An explicit channel overrides the parent's channel.
export function createChildLogContext(
  parent: Readonly<LogContext>,
  fields: Readonly<Record<string, unknown>>,
  channel?: string | null,
): LogContext {
  const merged = { ...parent.fields, ...fields };
  return { channel: channel !== undefined ? channel : parent.channel, fields: merged };
}

// Creates a sink that records every entry as a tagged JSON envelope on console.debug — low
// visual noise, but the Playwright capture script reads every console level, so it always
// lands in logs.jsonl. Entries at or above the console threshold (setLogConsoleLevel) are ALSO
// printed as a human-readable line via the matching console method. Install with addLogSink or
// setLogSink.
export function createConsoleCaptureSink(options: { formatter?: LogFormatter } = {}): LogSink {
  const envelopeFormatter = options.formatter ?? _defaultJsonFormatter;
  return (entry: Readonly<LogEntry>): void => _writeConsoleCaptureEntry(entry, envelopeFormatter);
}

// Creates a fan-out sink that forwards every entry to all supplied sinks.
export function createFanoutLogSink(...sinks: LogSink[]): LogSink {
  const list = sinks.slice();
  return (entry: Readonly<LogEntry>): void => {
    for (const s of list) s(entry);
  };
}

// Creates a sink that writes formatted entries to a LogTransportBackend. The backend is resolved
// at emit time (not at creation time) so setLogTransportBackend can be called after
// createFileLogSink. The formatter defaults to createJsonLogFormatter (one JSON line per entry).
// Use disposeFileLogSink to flush and release the underlying backend resource.
export function createFileLogSink(options: { formatter?: LogFormatter } = {}): FileLogSink {
  const formatter = options.formatter ?? createJsonLogFormatter();
  const sink: LogSink = (entry: Readonly<LogEntry>): void => {
    const backend = _transportBackend;
    if (backend === null) return;
    backend.write(formatter(entry) + '\n');
  };
  const handle: FileLogSink = { sink };
  return handle;
}

// Creates a sink that forwards only entries matching a predicate. Compose with addLogSink to give
// each target its own independent filter (per-sink level, per-channel filter, etc.).
export function createFilterLogSink(target: LogSink, predicate: (entry: Readonly<LogEntry>) => boolean): LogSink {
  return (entry: Readonly<LogEntry>): void => {
    if (predicate(entry)) target(entry);
  };
}

// Creates a formatter that produces the `__flight` JSON envelope used by the capture harness.
// Field redaction (setLogRedactionPaths) and custom serializers (registerLogSerializer) are
// applied during formatting.
export function createJsonLogFormatter(): LogFormatter {
  return (entry: Readonly<LogEntry>): string => {
    const { level, channel, data } = entry;
    const serialized = _applySerializers(typeof data === 'string' ? { msg: data } : (data as Record<string, unknown>));
    const redacted = _redactionPaths.length > 0 ? _applyRedaction(serialized) : serialized;
    return JSON.stringify({
      __flight: true,
      t: _timestamp(),
      level: _levelNames[level],
      channel,
      data: redacted,
    });
  };
}

// Creates a bound logging context with a channel and optional base fields. Pass the context to
// logWith / logErrorWith / etc. to have the channel and fields merged into every entry.
export function createLogContext(channel: string | null, fields: Readonly<Record<string, unknown>> = {}): LogContext {
  return { channel, fields };
}

// Creates a named tracing span. The returned LogSpan is a plain value — it is not active until
// enterLogSpan is called. While active, the span's fields are merged into every emitted entry
// (span fields have lower priority than direct emit fields). enterLogSpan / exitLogSpan are
// stack-based: multiple spans can be active simultaneously; the most recently entered span wins
// on field key collision.
export function createLogSpan(
  name: string,
  fields: Readonly<Record<string, unknown>> = {},
  channel: string | null = null,
): LogSpan {
  return { name, fields, channel };
}

// Creates a sink that captures the last `capacity` entries in a ring buffer. Use
// getMemoryLogSinkEntries to read (oldest-first) and clearMemoryLogSink to reset.
export function createMemoryLogSink(capacity: number): MemoryLogSink {
  const state: MemoryLogSinkState = { buf: [], head: 0 };
  const sink: LogSink = (entry: Readonly<LogEntry>) => {
    const stored: LogEntry = { level: entry.level, channel: entry.channel, data: entry.data };
    if (state.buf.length < capacity) {
      state.buf.push(stored);
    } else {
      state.buf[state.head] = stored;
      state.head = (state.head + 1) % capacity;
    }
  };
  const handle: MemoryLogSink = { sink };
  _memorySinkStates.set(handle, state);
  return handle;
}

// Creates a sink that forwards at most `maxPerInterval` entries per `intervalMs` window. When
// `perChannel` is true, the budget is tracked per channel independently.
export function createRateLimitedLogSink(
  target: LogSink,
  options: { perChannel?: boolean; maxPerInterval: number; intervalMs: number },
): RateLimitedLogSink {
  const { perChannel = false, maxPerInterval, intervalMs } = options;
  const counts = new Map<string | null, number>();
  let windowStart = _timestamp();

  const sink: LogSink = (entry: Readonly<LogEntry>): void => {
    const now = _timestamp();
    if (now - windowStart >= intervalMs) {
      counts.clear();
      windowStart = now;
    }
    const key = perChannel ? entry.channel : null;
    const current = counts.get(key) ?? 0;
    if (current >= maxPerInterval) return;
    counts.set(key, current + 1);
    target(entry);
  };
  return { sink };
}

// Creates a sink that forwards approximately 1-in-N entries (probability = 1 / rate when rate > 1).
export function createSampledLogSink(target: LogSink, rate: number): LogSink {
  if (rate <= 1) return target;
  let counter = 0;
  return (entry: Readonly<LogEntry>): void => {
    counter = (counter + 1) % rate;
    if (counter === 0) target(entry);
  };
}

// Creates a formatter that produces a human-readable `[channel] message` line. When
// `indentGroups` is true the formatter indents the message by the current group depth.
export function createTextLogFormatter(
  options: { indentGroups?: boolean; levelPrefix?: boolean; timestamp?: boolean } = {},
): LogFormatter {
  return (entry: Readonly<LogEntry>): string => {
    const { level, channel, data } = entry;
    const parts: string[] = [];
    if (options.timestamp) parts.push(`t=${_timestamp().toFixed(2)}`);
    if (options.levelPrefix) parts.push(_levelNames[level] ?? 'unknown');
    parts.push(channel !== null ? `[${channel}]` : '[flight]');
    if (options.indentGroups && _groupDepth > 0) parts.push('  '.repeat(_groupDepth));
    if (typeof data === 'string') parts.push(data);
    else parts.push(JSON.stringify(data));
    return parts.join(' ');
  };
}

// Creates the web default LogTransportBackend — a no-op transport whose write/flush/dispose do
// nothing. The web has no destination a sink can write a formatted line to (no filesystem, and
// network requests from within a sink are outside the SDK's concern), so createFileLogSink entries
// silently drop until a host registers a real backend via setLogTransportBackend. Native/Node hosts
// register a backend that writes the lines to a file or stream; for remote shipping, compose
// createBufferedLogSink over such a backend rather than baking batching into the transport.
export function createWebLogTransportBackend(): LogTransportBackend {
  // Web default: no-op transport (the SDK does not own network requests from sinks).
  return {
    write(_line: string): void {
      // no-op on web — caller must register a real backend via setLogTransportBackend
    },
  };
}

// Flushes a file-log sink's transport backend immediately, then disposes it. After this call
// createFileLogSink entries will silently no-op until setLogTransportBackend is called again.
// (`dispose*` — releases the backend resource; no GPU/native handle.)
export function disposeFileLogSink(_handle: FileLogSink): void {
  const backend = _transportBackend;
  if (backend === null) return;
  if (backend.flush) backend.flush();
  if (backend.dispose) backend.dispose();
}

// Disposes a buffered sink: cancels its interval timer and flushes remaining entries. The sink
// remains callable after disposal but will no longer auto-flush. (`dispose*` because this
// detaches the timer that keeps the sink reachable — no non-GC resource.)
export function disposeLogSink(handle: BufferedLogSink): void {
  const state = _bufferedSinkStates.get(handle);
  if (!state) return;
  if (state.timer !== null) clearInterval(state.timer);
  state.flush();
  state.timer = null;
}

// Enables the log signals group. Returns the process-global LogSignals entity; calling multiple
// times returns the same object. Tree-shakes away unless this function is called. The signals
// are emitted synchronously in the fan-out path.
export function enableLogSignals(): LogSignals {
  if (_logSignals !== null) return _logSignals;
  _logSignals = {
    onLogEntry: createSignal<(entry: Readonly<LogEntry>) => void>(),
    onLogError: createSignal<(entry: Readonly<LogEntry>) => void>(),
  };
  return _logSignals;
}

// Closes the innermost open log group (decrements nesting depth). Emits a Debug entry marking
// the group end. No-op if no group is open.
export function endLogGroup(channel: string | null = null): void {
  if (_groupDepth <= 0) return;
  _groupDepth--;
  if (!_passesLevelGate(LogLevel.Debug, channel)) return;
  _emitToSinks({ level: LogLevel.Debug, channel, data: { group: 'end', depth: _groupDepth + 1 } });
}

// Ends a timer, emits a structured Debug entry with the elapsed milliseconds, and returns the
// elapsed time in milliseconds.
export function endLogTimer(timer: Readonly<LogTimer>): number {
  const elapsed = _timestamp() - timer.startedAt;
  logDebug({ label: timer.label, elapsedMs: elapsed }, timer.channel);
  return elapsed;
}

// Activates a log span, pushing it onto the active-span stack. While active, the span's fields
// and channel are merged into every emitted entry. The span with the highest stack index (most
// recently entered) wins on field key collision. Pair every enterLogSpan with exitLogSpan.
export function enterLogSpan(span: Readonly<LogSpan>): void {
  _spanStack.push(span);
}

// Deactivates a log span by removing it from the active-span stack. The span need not be the
// topmost — it is removed by identity from wherever it appears in the stack, supporting both
// strict LIFO and out-of-order unwinding. No-op if the span is not in the stack.
export function exitLogSpan(span: Readonly<LogSpan>): void {
  const idx = _spanStack.indexOf(span);
  if (idx >= 0) _spanStack.splice(idx, 1);
}

// Flushes a buffered sink immediately, forwarding all queued entries to its target.
export function flushLogSink(handle: BufferedLogSink): void {
  const state = _bufferedSinkStates.get(handle);
  if (state) state.flush();
}

// Listener side. Per-channel level override. Returns null when no channel-specific level is set
// (the channel inherits the global level).
export function getLogChannelLevel(channel: string): LogLevel | null {
  return _channelLevels.get(channel) ?? null;
}

// Listener side. Reads the human-readable console threshold (default LogLevel.Info). Capture is
// unaffected by it — the console-capture sink records every level regardless.
export function getLogConsoleLevel(): LogLevel {
  return _consoleLevel;
}

// Listener side. Reads the global minimum emit level (default LogLevel.Verbose — emit
// everything). Lower-priority levels (higher numeric value) are suppressed before any sink work.
export function getLogLevel(): LogLevel {
  return _level;
}

// Listener side. Returns the canonical lowercase name for a LogLevel value.
export function getLogLevelName(level: LogLevel): string {
  return _levelNames[level] ?? 'unknown';
}

// Returns the installed LogTransportBackend, or null if none has been set.
export function getLogTransportBackend(): LogTransportBackend | null {
  return _transportBackend;
}

// Returns the captured log entries from a memory sink in insertion order (oldest-first).
export function getMemoryLogSinkEntries(handle: MemoryLogSink): readonly LogEntry[] {
  const state = _memorySinkStates.get(handle);
  if (!state) return [];
  const { buf, head } = state;
  // If head is 0 the buffer has not wrapped, or it just wrapped — either way slice gives correct order.
  if (head === 0) return buf.slice();
  // Ring buffer wrapped: entries from head..end are oldest, then start..head are newest.
  return [...buf.slice(head), ...buf.slice(0, head)];
}

// Emit side. Emits a log entry at an explicit level. `channel` is a free categorization tag
// (e.g. 'batch', 'shader', 'user') for filtering captured output. Accepts a plain LogData value
// or a LogDataProvider thunk — the thunk is not called unless the entry passes the level gate,
// making suppressed verbose calls allocation-free. No-ops when no sinks are installed or when
// the global or per-channel level gate suppresses the entry.
export function log(level: LogLevel, data: LogData | LogDataProvider, channel: string | null = null): void {
  if (!_passesLevelGate(level, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  const entry: LogEntry = { level, channel, data: _mergeSpanFields(resolved, channel) };
  _emitToSinks(entry);
}

// Emit side. Emits an Error-level entry only when condition is false. Never throws — sentinel
// behavior for assertion-style diagnostics.
export function logAssert(condition: boolean, data: LogData | LogDataProvider, channel: string | null = null): void {
  if (condition) return;
  if (!_passesLevelGate(LogLevel.Error, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level: LogLevel.Error, channel, data: _mergeSpanFields(resolved, channel) });
}

// Emit side. Severity-named convenience wrappers over log (mirrors console.debug/info/warn/error).
export function logDebug(data: LogData | LogDataProvider, channel: string | null = null): void {
  if (!_passesLevelGate(LogLevel.Debug, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level: LogLevel.Debug, channel, data: _mergeSpanFields(resolved, channel) });
}

export function logDebugWith(context: Readonly<LogContext>, data: LogData | LogDataProvider): void {
  const { channel } = context;
  if (!_passesLevelGate(LogLevel.Debug, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({
    level: LogLevel.Debug,
    channel,
    data: _mergeContextFields(context, _mergeSpanFields(resolved, channel)),
  });
}

export function logError(data: LogData | LogDataProvider, channel: string | null = null): void {
  if (!_passesLevelGate(LogLevel.Error, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level: LogLevel.Error, channel, data: _mergeSpanFields(resolved, channel) });
}

export function logErrorWith(context: Readonly<LogContext>, data: LogData | LogDataProvider): void {
  const { channel } = context;
  if (!_passesLevelGate(LogLevel.Error, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({
    level: LogLevel.Error,
    channel,
    data: _mergeContextFields(context, _mergeSpanFields(resolved, channel)),
  });
}

export function logInfo(data: LogData | LogDataProvider, channel: string | null = null): void {
  if (!_passesLevelGate(LogLevel.Info, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level: LogLevel.Info, channel, data: _mergeSpanFields(resolved, channel) });
}

export function logInfoWith(context: Readonly<LogContext>, data: LogData | LogDataProvider): void {
  const { channel } = context;
  if (!_passesLevelGate(LogLevel.Info, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({
    level: LogLevel.Info,
    channel,
    data: _mergeContextFields(context, _mergeSpanFields(resolved, channel)),
  });
}

// Emit side. Emits a given key at most once per process lifetime (useful for warmup warnings and
// deprecation notices). Returns true if the entry was emitted, false if it was suppressed.
export function logOnce(
  key: string,
  level: LogLevel,
  data: LogData | LogDataProvider,
  channel: string | null = null,
): boolean {
  if (_onceKeys.has(key)) return false;
  _onceKeys.add(key);
  log(level, data, channel);
  return true;
}

export function logVerbose(data: LogData | LogDataProvider, channel: string | null = null): void {
  if (!_passesLevelGate(LogLevel.Verbose, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level: LogLevel.Verbose, channel, data: _mergeSpanFields(resolved, channel) });
}

export function logVerboseWith(context: Readonly<LogContext>, data: LogData | LogDataProvider): void {
  const { channel } = context;
  if (!_passesLevelGate(LogLevel.Verbose, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({
    level: LogLevel.Verbose,
    channel,
    data: _mergeContextFields(context, _mergeSpanFields(resolved, channel)),
  });
}

export function logWarn(data: LogData | LogDataProvider, channel: string | null = null): void {
  if (!_passesLevelGate(LogLevel.Warn, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level: LogLevel.Warn, channel, data: _mergeSpanFields(resolved, channel) });
}

export function logWarnWith(context: Readonly<LogContext>, data: LogData | LogDataProvider): void {
  const { channel } = context;
  if (!_passesLevelGate(LogLevel.Warn, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({
    level: LogLevel.Warn,
    channel,
    data: _mergeContextFields(context, _mergeSpanFields(resolved, channel)),
  });
}

// Emit side. Emits a log entry using the bound channel and merged fields from a LogContext. The
// context's fields are merged into the entry's data (string data becomes { msg, ...fields }).
export function logWith(context: Readonly<LogContext>, level: LogLevel, data: LogData | LogDataProvider): void {
  const { channel } = context;
  if (!_passesLevelGate(level, channel)) return;
  const resolved: LogData = typeof data === 'function' ? data() : data;
  _emitToSinks({ level, channel, data: _mergeContextFields(context, _mergeSpanFields(resolved, channel)) });
}

// Listener side. Parses a level name (case-insensitive) back to a LogLevel. Returns null for
// unknown names (sentinel, not a throw).
export function parseLogLevel(name: string): LogLevel | null {
  return _levelByName.get(name.toLowerCase()) ?? null;
}

// Registers a custom serializer for a named kind. When the JSON formatter encounters a field
// value whose `__kind` property matches `kind`, it calls `fn` to convert the value to a plain
// record. Kind strings follow the `*Kind`-style string registry: last-write-wins; vendor-prefix
// custom kinds (e.g. 'acme.Foo') to avoid collisions with built-in kinds (bare names reserved).
export function registerLogSerializer(kind: string, fn: (value: unknown) => Record<string, unknown>): void {
  _serializers.set(kind, fn);
}

// Listener side. Removes a sink from the fan-out list. Returns false if not present (sentinel,
// not a throw).
export function removeLogSink(sink: LogSink): boolean {
  const idx = _sinks.indexOf(sink);
  if (idx < 0) return false;
  _sinks.splice(idx, 1);
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
export function setLogChannelLevel(channel: string, level: LogLevel): void {
  _channelLevels.set(channel, level);
}

// Listener side. Sets the highest level printed as a human-readable console line. LogLevel.None
// silences those lines; the capture record still receives every level.
export function setLogConsoleLevel(level: LogLevel): void {
  _consoleLevel = level;
}

// Listener side. Sets the global minimum emit level. Entries below this level are suppressed
// before any sink work, making suppressed verbose logging genuinely free in hot paths.
export function setLogLevel(level: LogLevel): void {
  _level = level;
}

// Sets the redaction paths applied by the JSON formatter. Paths use dot notation to target
// nested fields (e.g. ['headers.authorization', 'user.token']). Matching field values are
// replaced with '[REDACTED]'. Pass an empty array to disable redaction.
export function setLogRedactionPaths(paths: readonly string[]): void {
  _redactionPaths.length = 0;
  for (const p of paths) _redactionPaths.push(p);
}

// Installs (or clears, with null) the single sink — clears the list then adds the new sink if
// non-null. Kept for source compatibility with the capture harness.
export function setLogSink(sink: LogSink | null): void {
  _sinks.length = 0;
  if (sink !== null) _sinks.push(sink);
}

// Sets the LogTransportBackend used by createFileLogSink. Set to null to detach the backend.
// Call createWebLogTransportBackend for a no-op web default; native/Node hosts register a real
// fs-backed implementation. The backend is process-global (one transport per process).
export function setLogTransportBackend(backend: LogTransportBackend | null): void {
  _transportBackend = backend;
}

// Starts a named timer. Pass the returned LogTimer to endLogTimer to record elapsed time and
// emit a structured Debug entry.
export function startLogTimer(label: string, channel: string | null = null): LogTimer {
  return { label, channel, startedAt: _timestamp() };
}

interface BufferedLogSinkState {
  buf: LogEntry[];
  flush: () => void;
  timer: ReturnType<typeof setInterval> | null;
}

interface MemoryLogSinkState {
  buf: LogEntry[];
  head: number;
}

const _bufferedSinkStates = new WeakMap<BufferedLogSink, BufferedLogSinkState>();
const _memorySinkStates = new WeakMap<MemoryLogSink, MemoryLogSinkState>();

const _consoleMethods: Readonly<Record<LogLevel, 'debug' | 'error' | 'info' | 'log' | 'warn'>> = {
  [LogLevel.None]: 'log',
  [LogLevel.Error]: 'error',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Info]: 'info',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Verbose]: 'log',
};

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

const _channelLevels = new Map<string, LogLevel>();
const _onceKeys = new Set<string>();
const _redactionPaths: string[] = [];
const _serializers = new Map<string, (value: unknown) => Record<string, unknown>>();
const _sinks: LogSink[] = [];
const _spanStack: LogSpan[] = [];

let _consoleLevel: LogLevel = LogLevel.Info;
let _groupDepth = 0;
let _level: LogLevel = LogLevel.Verbose;
let _logSignals: LogSignals | null = null;
let _transportBackend: LogTransportBackend | null = null;

// Applies registered serializers to values whose `__kind` matches a registered kind.
function _applySerializers(data: Record<string, unknown>): Record<string, unknown> {
  if (_serializers.size === 0) return data;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      '__kind' in value &&
      typeof (value as Record<string, unknown>).__kind === 'string'
    ) {
      const kind = (value as Record<string, unknown>).__kind as string;
      const fn = _serializers.get(kind);
      result[key] = fn ? fn(value) : value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Applies dot-notation redaction paths to a record, replacing matching values with '[REDACTED]'.
function _applyRedaction(data: Record<string, unknown>): Record<string, unknown> {
  if (_redactionPaths.length === 0) return data;
  // Shallow copy at root; only deep-copy when traversal requires it.
  const result = { ...data };
  for (const path of _redactionPaths) {
    const parts = path.split('.');
    _redactPath(result, parts, 0);
  }
  return result;
}

function _redactPath(obj: Record<string, unknown>, parts: string[], idx: number): void {
  if (idx >= parts.length) return;
  const key = parts[idx];
  if (!(key in obj)) return;
  if (idx === parts.length - 1) {
    obj[key] = '[REDACTED]';
    return;
  }
  const next = obj[key];
  if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
    // Deep-copy one level before mutating.
    obj[key] = { ...(next as Record<string, unknown>) };
    _redactPath(obj[key] as Record<string, unknown>, parts, idx + 1);
  }
}

function _emitToSinks(entry: LogEntry): void {
  for (const sink of _sinks) sink(entry);
  if (_logSignals !== null) {
    emitSignal(_logSignals.onLogEntry, entry);
    if (entry.level === LogLevel.Error) emitSignal(_logSignals.onLogError, entry);
  }
}

function _mergeContextFields(context: Readonly<LogContext>, data: LogData): LogData {
  const { fields } = context;
  if (Object.keys(fields).length === 0) return data;
  if (typeof data === 'string') return { msg: data, ...fields };
  return { ...fields, ...(data as Record<string, unknown>) };
}

// Merges active span fields into emitted data. Span fields have lower priority than data fields;
// later spans in the stack win over earlier ones on key collision within span fields.
function _mergeSpanFields(data: LogData, _channel: string | null): LogData {
  if (_spanStack.length === 0) return data;
  // Accumulate span fields oldest-first so newer spans overwrite older ones.
  const spanFields: Record<string, unknown> = {};
  for (const span of _spanStack) {
    Object.assign(spanFields, span.fields);
  }
  if (Object.keys(spanFields).length === 0) return data;
  // Data fields win over span fields on key collision.
  if (typeof data === 'string') return { msg: data, ...spanFields };
  return { ...spanFields, ...(data as Record<string, unknown>) };
}

function _passesLevelGate(level: LogLevel, channel: string | null): boolean {
  if (_sinks.length === 0 && _logSignals === null) return false;
  const gate = channel !== null && _channelLevels.has(channel) ? _channelLevels.get(channel)! : _level;
  return level <= gate && level !== LogLevel.None;
}

function _timestamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const _defaultJsonFormatter: LogFormatter = (entry: Readonly<LogEntry>): string => {
  const { level, channel, data } = entry;
  return JSON.stringify({
    __flight: true,
    t: _timestamp(),
    level: _levelNames[level],
    channel,
    data: typeof data === 'string' ? { msg: data } : data,
  });
};

/* eslint-disable no-console -- this is the console-capture sink; writing to the console is its job */
function _writeConsoleCaptureEntry(entry: Readonly<LogEntry>, envelopeFormatter: LogFormatter): void {
  if (typeof console === 'undefined') return;
  const { level, channel } = entry;
  // The capture record: every level, as a tagged JSON line the collector parses.
  console.debug(envelopeFormatter(entry));
  // The human-readable subset.
  if (level !== LogLevel.None && _consoleLevel >= level) {
    const method = _consoleMethods[level];
    const prefix = channel !== null ? `[${channel}]` : '[flight]';
    const { data } = entry;
    if (typeof data === 'string') console[method](`${prefix} ${data}`);
    else console[method](prefix, data);
  }
}
/* eslint-enable no-console */
