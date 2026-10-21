# flight-shell

OS shell capability seam: external URL policy, trash, path open and reveal, shortcut links, beep,
and child-process spawning, all routed through caller-supplied host providers. No platform shell,
process, trash, shortcut, audio or native host implementation lives here.

## Process streams

The pinned TS `ShellProcess` exposes standard `ReadableStream<Uint8Array>` and
`WritableStream<Uint8Array>` members. The IR has no Web Streams vocabulary row, so the two stream
positions are represented as callback records:

- `ShellReadableStream.read()` settles `Uint8Array | null`, where `null` is the reader's done arm;
- `ShellWritableStream.write()` settles a chunk write, and `.close()` settles the close.

Reader/writer locking, cancellation, BYOB reads, abort and backpressure signalling are outside
these records. See the task report for the exact limitation.

## Precision

No `f64` value is used. Process exit codes, shortcut icon indices and byte chunks are `i32`, `i32`
and `u8` respectively.
