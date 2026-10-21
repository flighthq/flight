# flight-clipboard

Clipboard capability seam: plain text, HTML, RTF, image, bookmark and generic MIME-format reads
and writes, plus change watches, all routed through explicit host capability slots. No system
clipboard, OS pasteboard or native provider lives here.

## Watch ownership

The source keeps active watch subscriptions in a module-level map. Rust keeps the same lifecycle on
the `ClipboardWatch` entity itself: the active unsubscribe callback is stored in the watch's private
runtime slot, so attaching again releases the prior subscription first (even for a different host),
detach is idempotent, and dispose is detach. Signal identity is preserved across attach because the
subscription callback emits on a clone of the watch's `on_change` signal. `attach_clipboard_watch`
takes the required `HostClipboardChangeSubscriber` shape (the source's
`Required<Pick<HostClipboardChangeCapability, 'subscribe'>>`), while the aggregate capability keeps
its optional method so capability absence stays representable.

## Sentinels and rejection

Access-denied and absent values are `Ok` sentinels, never throws: `Ok(false)` for writes and clear,
`Ok("")` for string reads, `Ok([])` for the format list, `Ok(None)` for a bookmark. The SDK forwards
each one unchanged and never fabricates a default. A provider promise rejection is the forwarded
`Err(FlightError)` of the same operation and is never converted into a sentinel; failures stay
distinguishable from denial.

## Precision

No `f64` is used. The format list is `Vec<String>`; the multi-format read result is the shared
`Record<String>` plain-dictionary type, preserving the source's JavaScript key order: integer-index
keys enumerate ascending first, then all other keys in insertion order. Assigning an existing key
replaces its value in place and keeps its original position; deleting removes it.
