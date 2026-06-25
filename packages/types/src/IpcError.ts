/** Taxonomy of IPC operation errors. */
export type IpcErrorCode = 'handler-threw' | 'no-handler' | 'timeout' | 'serialization-failure' | 'backend-absent';
/**
 * Structured IPC error — plain data, not a thrown value. Returned (not thrown) by operations
 * that expose a typed error path (e.g. `IpcTimeoutError`). For rejections from `invokeIpc`, the
 * backend rejects with a plain `Error`; this type is used by in-package wrappers that need to
 * carry structured metadata about what failed.
 */
export interface IpcError {
  readonly code: IpcErrorCode;
  readonly message: string;
  readonly channel: string;
}
