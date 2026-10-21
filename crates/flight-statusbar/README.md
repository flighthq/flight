# flight-statusbar

The mobile status bar (TS `@flighthq/statusbar`), routed only through host capabilities, with no real OS status bar:
- `attach_status_bar` pins the change and info providers and emits a fresh `StatusBarInfo` snapshot per change.
- The style stack is caller-owned state (`StatusBarStyleStacks`), replacing the source module WeakMap and handle counter. It keeps one stack per info provider, keyed by that provider's object identity (the `provider` field, Principal 9170da33). For each field, the last-pushed set value wins and absent fields fall through to a baseline captured once. Only changed fields are written, in source order. Handles start at 1, and -1 is the invalid sentinel.

## Precision

`color` is a packed RGBA `u32` (0xRRGGBBAA). `height` is `f32` CSS pixels (-1 when unreported): a reported layout size, never accumulated.
