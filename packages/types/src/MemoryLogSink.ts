import type { Entity } from './Entity.ts';
import type { LogSink } from './Log.ts';

// Opaque token returned by createMemoryLogSink. Carry it to read or clear the captured entries.
// The sink field is the LogSink to install via addLogSink / setLogSink.
export interface MemoryLogSink extends Entity {
  readonly sink: LogSink;
}
