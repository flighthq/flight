import type {
  FileLogSink,
  FileLogSinkDestroyOutcome,
  LogEntry,
  LogFormatter,
  LogSink,
  LogTransport,
  LogTransportDestroyOutcome,
  LogTransportFlushOutcome,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import type { LogState } from './log.ts';
import { createJsonLogFormatter, removeLogSink } from './log.ts';

// A TS-only companion of the log module (declared on crates/flight-log/src/log.rs): the transport's
// lifecycle is Promise-based, which the Rust contract does not model.

// Options for createFileLogSink.
export interface FileLogSinkOptions {
  formatter?: LogFormatter;
}

// Creates an Entity sink that exclusively owns the configured transport for its entire lifetime.
// The formatter defaults to createJsonLogFormatter over `state` (one complete JSON line per entry).
// Each sink call offers that line synchronously to the pinned transport; admission and later
// delivery remain the transport's explicit outcome contracts.
export function createFileLogSink(
  state: Readonly<LogState>,
  transport: LogTransport,
  options?: Readonly<FileLogSinkOptions>,
): FileLogSink {
  const formatter = options?.formatter ?? createJsonLogFormatter(state);
  const sink: LogSink = (entry: Readonly<LogEntry>): void => {
    const sinkState = _fileLogSinkStates.get(handle);
    if (!sinkState || sinkState.status !== 'active' || sinkState.transport === null) return;
    sinkState.transport.write(formatter(entry) + '\n');
  };
  const handle: FileLogSink = { [EntityRuntimeKey]: undefined, sink };
  _fileLogSinkStates.set(handle, {
    destroyPromise: null,
    status: 'active',
    transport,
  });
  return handle;
}

// Makes the sink terminal and unregisters it from `state` synchronously, then awaits its delivery
// boundary before attempting terminal transport teardown. Destroy is attempted even when flush fails
// or rejects, and both operation outcomes are preserved. Repeated calls await the same teardown
// without invoking the provider again.
export async function destroyFileLogSink(state: LogState, handle: FileLogSink): Promise<FileLogSinkDestroyOutcome> {
  const sinkState = _fileLogSinkStates.get(handle);
  if (!sinkState) throw new Error('destroyFileLogSink received an unknown handle');
  if (sinkState.status !== 'active') {
    const outcome = await sinkState.destroyPromise!;
    return { ...outcome, reason: 'already-destroyed' };
  }

  sinkState.status = 'destroying';
  removeLogSink(state, handle.sink);
  sinkState.destroyPromise = _destroyFileLogSinkState(sinkState);
  return sinkState.destroyPromise;
}

interface FileLogSinkState {
  destroyPromise: Promise<FileLogSinkDestroyOutcome> | null;
  status: 'active' | 'destroyed' | 'destroying';
  transport: LogTransport | null;
}

// Per-handle private sink state, keyed by the handle so it is collected with it.
const _fileLogSinkStates = new WeakMap<FileLogSink, FileLogSinkState>();

async function _destroyFileLogSinkState(state: FileLogSinkState): Promise<FileLogSinkDestroyOutcome> {
  const transport = state.transport!;
  let flush: LogTransportFlushOutcome;
  let destroy: LogTransportDestroyOutcome;

  try {
    flush = await transport.flush();
  } catch (error) {
    flush = { message: _operationFailureMessage(error), reason: 'operation-failed' };
  }

  try {
    destroy = await transport.destroy();
  } catch (error) {
    destroy = { message: _operationFailureMessage(error), reason: 'operation-failed' };
  }

  state.transport = null;
  state.status = 'destroyed';
  return {
    destroy,
    flush,
    reason:
      flush.reason === 'operation-failed' || destroy.reason === 'operation-failed' ? 'operation-failed' : 'destroyed',
  };
}

function _operationFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
