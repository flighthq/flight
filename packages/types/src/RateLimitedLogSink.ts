import type { LogSink } from './Log';

// Opaque token returned by createRateLimitedLogSink.
export interface RateLimitedLogSink {
  readonly sink: LogSink;
}
