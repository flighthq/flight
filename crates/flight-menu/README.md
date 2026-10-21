# flight-menu

Menu capability seam: application menu-bar installation, context-menu popups, highlight and select
event entities, and the default menu templates, all routed through explicit host providers. No OS
menu, tray or native provider lives here.

## Watch ownership

The source pins each highlight/select subscription's unsubscribe beside the entity that opened it
(a `WeakMap`). Rust stores it in the entity's private runtime slot, so: re-attaching detaches first,
detach ends exactly that entity's subscription even when another entity shares the provider,
detach is safe when never attached, and dispose detaches then clears the entity's listeners.

## Caller-owned state

Two source module-level records become explicit caller-owned state (D5):

- `MenuSignalsState` holds the opt-in context-menu dispatcher group. `enable_menu_signals` allocates
  it once and `get_menu_signals` reads it; `show_context_menu` takes the enabled group explicitly so
  no hidden singleton or TLS exists.
- `AppMenuDestroyedProviders` records finally-released application providers. `destroy_app_menu`
  destroys each distinct provider once (alias safety is shared `Ref` identity), attempts every
  provider even after one throws, re-throws the first error, and retains failed providers so a
  later call retries only them.

## Descriptors

`MenuItemTemplate` is plain data with the source's optional fields (`type_` is TS `type`).
`create_menu_item_template` fills the source defaults (`normal`, enabled true) recursively but is a
deliberate non-entity descriptor helper (no runtime slot, no entity factory, no sugar). Fourteen
source calls are sync; only the popup returns a promise, forwarded as `Result<Option<String>,
FlightError>` so a provider rejection is preserved and suppresses the close signal.

## Precision

Coordinates are `f32` (D1 default; no source evidence requires wider). No `f64` is used.
