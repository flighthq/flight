import type { Entity } from './Entity.ts';
import type { LogSink } from './Log.ts';

// Opaque token returned by createRateLimitedLogSink.
export interface RateLimitedLogSink extends Entity {
  readonly sink: LogSink;
}
