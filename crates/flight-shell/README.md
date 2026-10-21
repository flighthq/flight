# flight-shell

OS shell capability seam: external URL policy, trash, path open and reveal, shortcut links, beep,
and child-process spawning, all routed through caller-supplied host providers. No platform shell,
process, trash, shortcut, audio or native host implementation lives here.

## Process streams (D20)

`ShellProcess` uses the canonical `flight-stream` vocabulary, not shell-local records:

- `exit` is a `SharedFuture<Ref<ShellProcessExitStatus>>`: a stored promise that settles once,
  can be awaited repeatedly, and hands every observer the same resolved status identity.
- `stdin` is a `WritableStream`, `stdout` and `stderr` are `ReadableStream`s over `futures-io`
  `AsyncRead`/`AsyncWrite`. The exclusive borrow is the reader/writer lock, the caller's buffer is
  the BYOB view, pull polling is backpressure, `close_writable_stream` is the explicit close, and
  dropping the stream is cancel/abort.
- `terminate` remains the source's stored `Arc<dyn Fn()>` callback field.

Per-call check/install/beep/trash commands remain D15 `async fn`/boxed futures; only a promise
stored in a field uses `SharedFuture`.

## Precision

No `f64` value is used. Process exit codes, shortcut icon indices and byte chunks are `i32`, `i32`
and `u8` respectively.
