import type { LogSink } from './Log';

// Opaque token returned by createFileLogSink. The sink field is the LogSink to install via
// addLogSink / setLogSink. Call disposeFileLogSink to flush and release the backend.
export interface FileLogSink {
  readonly sink: LogSink;
}
