import type { Entity } from './Entity.ts';
import type { LogSink } from './Log.ts';

// Opaque token returned by createBufferedLogSink.
export interface BufferedLogSink extends Entity {
  readonly sink: LogSink;
}
