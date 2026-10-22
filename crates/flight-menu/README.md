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
- `AppMenuDestroyedProviders` records finally-released application providers as **non-owning weak
  handles to the provider identity token** (`provider: ProviderRef`, the canonical alias from
  flight-host), mirroring the source WeakSet keyed by the provider object. Every
  capability facet carries that token; facets from one provider clone the same token and different
  providers keep distinct tokens even when they share callbacks. Identity is compared with
  `Arc::ptr_eq`, never by callbacks or by the facet wrapper: two wrappers for one provider destroy
  once, while distinct providers destroy separately. A released token is not kept alive, expired
  entries are pruned and never suppress a distinct new provider, every provider is attempted even
  after one throws, the first error is re-thrown, and failed providers are retained so a later call
  retries only them.

## Descriptors

`MenuItemTemplate` is plain data shared by identity, exactly as the source passes the actual
mutable descriptor objects to providers. All fields are optional (`type_` is TS `type`) and children
are `Ref` handles, so a shared recursive graph — including cyclic misuse — is representable; no
entity runtime is involved.

- `create_menu_item_template` fills the source defaults (`normal`, enabled true) recursively into
  fresh descriptor nodes; it is a deliberate non-entity descriptor helper (no runtime, no sugar).
- `clone_menu_template` is the explicit deep copy: distinct descriptor objects all the way down.
- `validate_menu_item_template` walks the shared graph with an identity path and throws the exact
  source error on a cyclic submenu reference.
- `set_app_menu` and `show_context_menu` forward the descriptor handles; the popup clones only the
  outer handle vector at the async boundary, never the descriptor objects.

Fourteen source calls are sync; only the popup returns a promise, forwarded as
`Result<Option<String>, FlightError>` so a provider rejection is preserved and suppresses the close
signal.

## Precision

Coordinates are `f32` (D1 default; no source evidence requires wider). No `f64` is used.
