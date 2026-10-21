# flight-stream

D20 foundation shared by shell, filesystem and net: the `SharedFuture<T>` vocabulary for a TS
Promise stored in a field, and the `ReadableStream` / `WritableStream` vocabulary over `futures-io`
`AsyncRead` / `AsyncWrite`.

## Semantics

- `SharedFuture<T>` is cloneable and executor-neutral. Every clone observes the same result and
  the underlying operation runs once. Use `Ref<T>`/`Arc<T>` as the output when the value is not
  `Clone`. Returned promises stay `async fn`; this type is for stored promises only.
- `ReadableStream` / `WritableStream` own an exclusive byte-stream handle. The exclusive borrow is
  the lock, the caller's `Uint8Array` is the BYOB view, and pull polling (partial read/write
  counts) is backpressure. Dropping the stream is cancel/abort; `close_writable_stream` is the
  source's explicit close.
- The `futures` and `futures-io` types are implementation. Only the three vocabulary names cross
  the IR boundary.

## Precision

No `f64` is used. Stream counts are `usize`; chunk data is `Uint8Array` (`u8`).
