import type {
  FileLogSinkDestroyOutcome,
  LogData,
  LogEntry,
  LogTransport,
  LogTransportDestroyOutcome,
  LogTransportFlushOutcome,
  LogTransportWriteOutcome,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, LogLevel } from '@flighthq/types/contract';

import { createFileLogSink, destroyFileLogSink } from './fileLogSink.ts';
import type { LogState } from './log.ts';
import { addLogSink, createLogState, log, removeLogSink } from './log.ts';

function createTestLogTransport(
  overrides: Partial<Pick<LogTransport, 'destroy' | 'flush' | 'write'>> = {},
): LogTransport {
  const defaultDestroy = async (): Promise<LogTransportDestroyOutcome> => ({ reason: 'destroyed' });
  const defaultFlush = async (): Promise<LogTransportFlushOutcome> => ({
    delivery: 'process-buffer',
    reason: 'drained',
  });
  const defaultWrite = (): LogTransportWriteOutcome => ({ reason: 'accepted' });
  return {
    [EntityRuntimeKey]: undefined,
    destroy: overrides.destroy ?? defaultDestroy,
    flush: overrides.flush ?? defaultFlush,
    write: overrides.write ?? defaultWrite,
  };
}

function entryOf(level: LogLevel, channel: string | null, data: LogData, timestampMs = 0): LogEntry {
  return { level, channel, data, timestampMs };
}

let state: LogState;

beforeEach(() => {
  state = createLogState();
});

describe('createFileLogSink', () => {
  it.each<LogTransportWriteOutcome>([
    { reason: 'accepted' },
    { reason: 'backpressure', retryAfterMs: 25 },
    { message: 'disk full', reason: 'operation-failed' },
    { reason: 'destroyed' },
  ])('offers one complete formatted line when admission reports $reason', (writeOutcome) => {
    const lines: string[] = [];
    const transport = createTestLogTransport({
      write(line) {
        lines.push(line);
        return writeOutcome;
      },
    });
    const handle = createFileLogSink(state, transport);
    addLogSink(state, handle.sink);
    log(state, 4, LogLevel.Info, 'file-entry');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ __flight: true, t: 4, level: 'info', data: { msg: 'file-entry' } });
  });

  it('creates an Entity handle', () => {
    const handle = createFileLogSink(state, createTestLogTransport());

    expect(EntityRuntimeKey in handle).toBe(true);
    expect(handle[EntityRuntimeKey]).toBeUndefined();
  });

  it('accepts a custom formatter', () => {
    const lines: string[] = [];
    const transport = createTestLogTransport({
      write(line) {
        lines.push(line);
        return { reason: 'accepted' };
      },
    });
    const handle = createFileLogSink(state, transport, { formatter: () => 'custom' });
    addLogSink(state, handle.sink);
    log(state, 0, LogLevel.Info, 'x');
    expect(lines[0]).toBe('custom\n');
  });

  it("formats with its state's redaction paths by default", () => {
    const lines: string[] = [];
    const handle = createFileLogSink(
      state,
      createTestLogTransport({
        write(line) {
          lines.push(line);
          return { reason: 'accepted' };
        },
      }),
    );
    state.redactionPaths.push('token');

    handle.sink(entryOf(LogLevel.Info, null, { token: 'secret' }));

    expect(JSON.parse(lines[0]).data.token).toBe('[REDACTED]');
  });

  it('pins each handle to its injected transport', () => {
    const firstLines: string[] = [];
    const secondLines: string[] = [];
    const first = createFileLogSink(
      state,
      createTestLogTransport({
        write(line) {
          firstLines.push(line);
          return { reason: 'accepted' };
        },
      }),
      { formatter: () => 'first' },
    );
    const second = createFileLogSink(
      state,
      createTestLogTransport({
        write(line) {
          secondLines.push(line);
          return { reason: 'accepted' };
        },
      }),
      { formatter: () => 'second' },
    );

    first.sink(entryOf(LogLevel.Info, null, 'entry'));
    second.sink(entryOf(LogLevel.Info, null, 'entry'));

    expect(firstLines).toEqual(['first\n']);
    expect(secondLines).toEqual(['second\n']);
  });
});

describe('destroyFileLogSink', () => {
  it('awaits flush before destroying the transport', async () => {
    const events: string[] = [];
    let finishFlush: ((outcome: LogTransportFlushOutcome) => void) | undefined;
    const flushPromise = new Promise<LogTransportFlushOutcome>((resolve) => {
      finishFlush = resolve;
    });
    const transport = createTestLogTransport({
      destroy: async () => {
        events.push('destroy');
        return { reason: 'destroyed' };
      },
      flush: () => {
        events.push('flush-start');
        return flushPromise.then((outcome) => {
          events.push('flush-end');
          return outcome;
        });
      },
    });

    const closing = destroyFileLogSink(state, createFileLogSink(state, transport));
    expect(events).toEqual(['flush-start']);
    finishFlush?.({ delivery: 'operating-system', reason: 'drained' });

    await expect(closing).resolves.toEqual({
      destroy: { reason: 'destroyed' },
      flush: { delivery: 'operating-system', reason: 'drained' },
      reason: 'destroyed',
    });
    expect(events).toEqual(['flush-start', 'flush-end', 'destroy']);
  });

  it('attempts destroy and preserves both outcomes when flush fails', async () => {
    const events: string[] = [];
    const handle = createFileLogSink(
      state,
      createTestLogTransport({
        destroy: async () => {
          events.push('destroy');
          return { reason: 'destroyed' };
        },
        flush: async () => {
          events.push('flush');
          return { message: 'disk full', reason: 'operation-failed' };
        },
      }),
    );

    await expect(destroyFileLogSink(state, handle)).resolves.toEqual({
      destroy: { reason: 'destroyed' },
      flush: { message: 'disk full', reason: 'operation-failed' },
      reason: 'operation-failed',
    });
    expect(events).toEqual(['flush', 'destroy']);
  });

  it('keeps a successor destination live when an older handle is destroyed', async () => {
    const firstEvents: string[] = [];
    const secondLines: string[] = [];
    const first = createFileLogSink(
      state,
      createTestLogTransport({
        destroy: async () => {
          firstEvents.push('destroy');
          return { reason: 'destroyed' };
        },
      }),
    );
    const second = createFileLogSink(
      state,
      createTestLogTransport({
        write(line) {
          secondLines.push(line);
          return { reason: 'accepted' };
        },
      }),
      { formatter: () => 'second' },
    );

    await destroyFileLogSink(state, first);
    second.sink(entryOf(LogLevel.Info, null, 'still-live'));

    expect(firstEvents).toEqual(['destroy']);
    expect(secondLines).toEqual(['second\n']);
  });

  it('terminals and unregisters the sink before awaiting flush', async () => {
    const lines: string[] = [];
    let finishFlush: ((outcome: LogTransportFlushOutcome) => void) | undefined;
    const handle = createFileLogSink(
      state,
      createTestLogTransport({
        flush: () =>
          new Promise<LogTransportFlushOutcome>((resolve) => {
            finishFlush = resolve;
          }),
        write(line) {
          lines.push(line);
          return { reason: 'accepted' };
        },
      }),
    );
    addLogSink(state, handle.sink);

    const closing = destroyFileLogSink(state, handle);
    log(state, 0, LogLevel.Info, 'after-destroy-started');

    expect(lines).toEqual([]);
    expect(removeLogSink(state, handle.sink)).toBe(false);
    finishFlush?.({ delivery: 'process-buffer', reason: 'drained' });
    await closing;
  });

  it('makes repeated teardown idempotent without repeating provider calls', async () => {
    let destroyCalls = 0;
    let flushCalls = 0;
    const handle = createFileLogSink(
      state,
      createTestLogTransport({
        destroy: async () => {
          destroyCalls++;
          return { reason: 'destroyed' };
        },
        flush: async () => {
          flushCalls++;
          return { delivery: 'durable-storage', reason: 'drained' };
        },
      }),
    );

    const first: FileLogSinkDestroyOutcome = await destroyFileLogSink(state, handle);
    const second = await destroyFileLogSink(state, handle);

    expect(first).toEqual({
      destroy: { reason: 'destroyed' },
      flush: { delivery: 'durable-storage', reason: 'drained' },
      reason: 'destroyed',
    });
    expect(second).toEqual({ ...first, reason: 'already-destroyed' });
    expect({ destroyCalls, flushCalls }).toEqual({ destroyCalls: 1, flushCalls: 1 });
  });

  it.each<LogTransportFlushOutcome>([
    { delivery: 'process-buffer', reason: 'drained' },
    { delivery: 'operating-system', reason: 'drained' },
    { delivery: 'durable-storage', reason: 'drained' },
    { delivery: 'remote-acknowledged', reason: 'drained' },
  ])('preserves the $delivery delivery boundary', async (flushOutcome) => {
    const handle = createFileLogSink(state, createTestLogTransport({ flush: async () => flushOutcome }));

    const outcome = await destroyFileLogSink(state, handle);

    expect(outcome.flush).toEqual(flushOutcome);
  });

  it('converts rejected flush and destroy operations into a composite failure', async () => {
    const handle = createFileLogSink(
      state,
      createTestLogTransport({
        destroy: () => Promise.reject(new Error('close failed')),
        flush: () => Promise.reject(new Error('flush failed')),
      }),
    );

    await expect(destroyFileLogSink(state, handle)).resolves.toEqual({
      destroy: { message: 'close failed', reason: 'operation-failed' },
      flush: { message: 'flush failed', reason: 'operation-failed' },
      reason: 'operation-failed',
    });
  });

  it('rejects an unknown handle', async () => {
    const unknown = { [EntityRuntimeKey]: undefined, sink: (): void => {} };

    await expect(destroyFileLogSink(state, unknown)).rejects.toThrow('destroyFileLogSink received an unknown handle');
  });
});
