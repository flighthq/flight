import type { LogSink } from './Log';

// Opaque token returned by createMemoryLogSink. Carry it to read or clear the captured entries.
// The sink field is the LogSink to install via addLogSink / setLogSink.
export interface MemoryLogSink {
  readonly sink: LogSink;
}
