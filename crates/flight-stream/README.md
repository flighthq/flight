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

## Cancellation (D20 async primitives)

`AbortController` / `AbortSignal` mirror the Web API as plain shared data (no Entity status):

- `create_abort_controller()` owns one signal; `AbortSignal` clones share that signal state, so an
  abort through the controller is visible to every clone.
- `abort_controller(controller, reason: Option<Unknown>)` distinguishes the source's three arms:
  `None` is an omitted argument and resolves to the default `AbortError` record
  (`name: "AbortError"`, message exactly `"The operation was aborted."`); `Some(None)` is an
  explicit null reason; `Some(Some(value))` retains the provided value identity. The first abort
  wins; later calls keep the original reason and do not re-fire listeners.
- `is_abort_signal_aborted`; `get_abort_signal_reason` (outer `None` before abort, inner `None`
  for an explicit null, shared identity otherwise); `throw_if_aborted` (panics with the `Unknown`
  reason payload, including `None` for an explicit null); and `wait_aborted` (an executor-neutral
  awaitable that settles with the reason) cover the query surface.
- `add_abort_listener` / `remove_abort_listener` register and release listeners by shared callback
  identity (the Web API's function-identity removal). Dispatch iterates a snapshot but honors each
  listener's removed flag at invocation time (the DOM Standard), so an earlier listener that
  removes a later one suppresses that invocation, a re-added callback is a new registration, and a
  listener added during dispatch is not retroactively delivered. Listeners run in registration
  order with no lock held, so they may reenter the signal; a listener added after abort is
  retained but never invoked, as in the Web API. The default reason message is a chosen portable
  text, not a canonical engine string.

No tasks, runtime, provider or native operation is involved.
