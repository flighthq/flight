# flight-accessibility

Accessibility capability seam: the six public commands that expose a canvas/game UI's semantics
(roles, labels, states, focus) through an explicitly selected host provider, plus the plain
node/state/descriptor data those commands carry. No semantic tree, DOM, screen reader, native focus
or OS operation is implemented here; every command is forwarded to the caller's provider.

## Types

- `AccessibilityRole` is the source's open ARIA union (well-known roles plus any vendor string), so
  it stays a `String`; there is no closed string table for it.
- `AccessibilityLiveness` and `AccessibilityOperationBlockReason` are closed string unions with the
  source's exact canonical tables.
- `AccessibilityNode` is plain data. Its optional fields keep absence distinct (`None`), and
  `bounds` is the existing `flight_geometry::Rectangle` entity shared by `Ref` identity, never a
  copied value.
- `AccessibilityOperationOutcome<R = AccessibilityOperationBlockReason>` mirrors the source's two
  arms (an `Ok` arm and a `Blocked` arm carrying the reason) and carries the source's generic
  parameter. Each operation is instantiated with its exact source reason subset:
  `AccessibilityOperationOutcome<AccessibilityTreeBlockReason>` for announce, clear and set node
  (`destroyed | no-dom`), `AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason>` for
  remove (`destroyed | no-dom | node-not-found`), and
  `AccessibilityOperationOutcome<AccessibilityOperationBlockReason>` for focus (all four reasons).
  The narrower reason types are closed unions with their own exact string tables, so a tree
  operation cannot represent `focus-not-moved`; the type restriction is checked by compile-fail
  doctests.
- `AccessibilityDescriptor` is plain descriptor data independent of the provider command seam.
- `HostAccessibilityCapability` is a plain capability record carrying the canonical `ProviderRef`
  identity token; all six callbacks are required, exactly as in the source.

## Semantics

Each public function clones the selected callback out of the record and invokes it; there is no
lock, no global state and no provider fallback. `announce_accessibility` resolves the optional
liveness to `polite` in the source's position. `set_accessibility_node` forwards the node by
reference, so node identity, the shared `bounds` handle and optional-field absence survive the
provider boundary. Provider outcomes are forwarded unchanged, including `Destroyed`, `NoDom`,
`NodeNotFound` and `FocusNotMoved` where each operation can produce them.

## Sugar (D18)

`HostAccessibilityCapability` methods `announce`, `clear`, `destroy`, `remove_node`, `set_focus` and
`set_node` are thin delegates to the six free functions, each with one inline comparison in
`accessibility_sugar.rs`. No constructor or plain-record factory is invented.

## Precision

Numeric state values (`level`, `value_min`, `value_max`, `value_now`) are `f32` (D1 default; no
source evidence requires wider). No `f64` is used.
