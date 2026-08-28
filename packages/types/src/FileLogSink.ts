import type { LogSink } from './Log';

// Opaque token returned by createFileLogSink. The sink field is the LogSink to install via
// addLogSink / setLogSink. Call destroyFileLogSink to flush and free the backend's resource.
export interface FileLogSink {
  readonly sink: LogSink;
}
