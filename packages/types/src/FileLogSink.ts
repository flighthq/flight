import type { Entity } from './Entity';
import type { LogSink, LogTransportDestroyOutcome, LogTransportFlushOutcome } from './Log';

/**
 * Owned file-sink entity returned by createFileLogSink. Install `sink` with addLogSink and await
 * destroyFileLogSink to stop admission, unregister it, flush its pinned transport, and release it.
 */
export interface FileLogSink extends Entity {
  readonly sink: LogSink;
}

/** The preserved flush and destroy results for terminal FileLogSink teardown. */
export interface FileLogSinkDestroyOutcome {
  readonly reason: 'destroyed' | 'already-destroyed' | 'operation-failed';
  readonly flush: LogTransportFlushOutcome;
  readonly destroy: LogTransportDestroyOutcome;
}
