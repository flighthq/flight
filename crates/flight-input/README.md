# flight-input

Input capability seam: normalized keyboard, pointer, wheel, text and gamepad events routed through
an explicit host ingress provider, with a live held-state snapshot and per-frame edge sets. No OS
event, device, window or native provider lives here.

## State and clock

- `InputState` keeps held keys/buttons/axes and the four per-frame edge sets. Edge sets record
  transitions: a held key's auto-repeat is not a new press, and a press plus release in one frame
  both survive until `end_input_state_frame`.
- `InputManager.enabled` gates every sink emission. Attachments are origin-pinned per manager,
  source identity and input kind, so the same source can be attached to several managers/kinds and
  detached precisely; re-attaching the same source and kind releases the prior origin once.
- `InputKeyRepeatTimer` takes no real timer. The caller's clock is injected: `start` invokes the
  callback immediately and records the delayed tick, `advance` fires every due tick in order, and
  `stop` cancels. This mirrors the source's setTimeout/setInterval timing without any runtime.

## Descriptors

Input data records are plain values. `InputIngressSource` is an opaque shared identity handle
(`Ref`), matching the source's host-neutral `object`; portable callers never name host members.
Callback-struct capabilities carry stored `Arc<dyn Fn>` callbacks (D9d); pointer-lock commands use
D15 boxed futures.

## Precision

`f32` is the default. Event timestamps and key-repeat delay/interval/clock values are `f64`
millisecond quantities, declared per item: f32 loses fractional precision for long uptimes and
delays. Gamepad keys are encoded with the source's 32-axis/64-button slots.
