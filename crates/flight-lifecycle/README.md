# flight-lifecycle

Application lifecycle over a host capability (TS `@flighthq/lifecycle`). `attach_app_lifecycle` subscribes to the supplied `HostLifecycleCapability` and emits on every provider notification:
- `on_state_change` fires raw, once per notification.
- `on_resume` / `on_pause` fire only on deduped edges, when crossing into or out of `Active`.
- `on_save_state` hands listeners a fresh bag on pause; `on_restore_state` re-emits that same bag on resume.
- `on_memory_warning` fires when the provider supplies a memory-warning source.

`request_app_back` emits `on_back_button` and reports whether a listener vetoed it with `cancel_signal`. Optional provider members are `Option` fields, and `explain_lifecycle_operation` reports their absence as the sentinel layer (flight-hostcapability). The subscription and the saved bag are private entity state, replacing the TS module WeakMaps. No lock is held while signals emit. The crate uses capability routing only, with no platform events.

The bag's representation of TS `Record<string, unknown>` is pending a vocabulary ruling.
