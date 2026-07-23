import type { LogSink } from './Log';

// Opaque token returned by createBufferedLogSink.
export interface BufferedLogSink {
  readonly sink: LogSink;
}
