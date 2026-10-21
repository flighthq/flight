# flight-clipboard

Clipboard capability seam: plain text, HTML, RTF, image, bookmark and generic MIME-format reads
and writes, plus change watches, all routed through explicit host capability slots. No system
clipboard, OS pasteboard or native provider lives here.

## Watch ownership

The source keeps active watch subscriptions in a module-level map. Rust keeps the same lifecycle on
the `ClipboardWatch` entity itself: the active unsubscribe callback is stored in the watch's private
runtime slot, so attaching again releases the prior subscription first (even for a different host),
detach is idempotent, and dispose is detach. Signal identity is preserved across attach because the
subscription callback emits on a clone of the watch's `on_change` signal.

## Sentinels

Access-denied and absent values are values, never throws: `false` for writes and clear, `''` for
string reads, `[]` for the format list, `null`/`None` for a bookmark. The SDK forwards each one
unchanged and never fabricates a default.

## Precision

No `f64` is used. The format list is `Vec<String>`; the multi-format read result is a lookup-only
`HashMap<String, String>` (D3), so record insertion order is not preserved.
