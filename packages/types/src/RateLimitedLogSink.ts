import type { Entity } from './Entity';
import type { LogSink } from './Log';

// Opaque token returned by createRateLimitedLogSink.
export interface RateLimitedLogSink extends Entity {
  readonly sink: LogSink;
}
