import type { Entity } from './Entity';
import type { LogSink } from './Log';

// Opaque token returned by createBufferedLogSink.
export interface BufferedLogSink extends Entity {
  readonly sink: LogSink;
}
