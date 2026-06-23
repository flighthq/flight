# New Package Spec: @flighthq/accessibility

**Represents:** The accessibility tree for display objects — accessible name/role/description/state and tab/focus order — projected through a swappable backend (DOM ARIA on web; native host accessibility-API seam), pairing with `interaction`/focus.

**Requested by:** missing-domains, openfl-lime-parity

## Fits

- **Architecture slot:** a hybrid of two existing patterns. The per-node a11y _metadata_ is a runtime-slot subsystem on the display-object graph (like `interaction` signals — attached to the runtime, the entity knows nothing about it). The _projection_ of that metadata into an OS-visible accessibility tree is a command-style platform capability with a `*Backend` seam, exactly like `clipboard`/`notification`/`dialog`: a web backend over DOM ARIA is always lazily available; native hosts swap it via `setAccessibilityBackend`. The two halves meet at `syncAccessibilityTree`, which walks the display graph's a11y metadata and pushes it through the backend.
- **Distinct from `interaction`.** `interaction` owns hit testing, pointer dispatch, and keyboard-event dispatch; it does **not** own focus _order_ or screen-reader exposure. `accessibility` owns the accessible-name/role/state model and the tab-order traversal, and _consumes_ interaction's focus/keyboard primitives rather than duplicating them. Programmatic focus movement (`focusAccessibleNode`) delegates to the same focus state interaction already dispatches keyboard events against. This is the OpenFL `AccessibilityProperties` / `accessibilityImplementation` home.
- **Dependencies:** `@flighthq/types` (header layer — all a11y types live here first), `@flighthq/node` (graph traversal for tab order and tree walking — operates over `HierarchyNode` / `Spatial2DNode` feature aliases, not a concrete graph family), `@flighthq/signals` (opt-in focus/announcement signal groups). It depends on `node`, **not** `displayobject` — accessibility is a graph-feature concern so it stays graph-kind-agnostic and works for sprite graphs and future families. No dependency on `interaction` in the core (the focus-state primitive it reads is in `node`/`interaction` via a feature alias); if a hard `interaction` link is needed it points one way (`accessibility` → `interaction`), never back.
- **Neighbor packages:** `@flighthq/accessibility-formats` for non-core mapping data — the role→ARIA-role lookup tables, WAI-ARIA authoring-practice role-requirement tables, and any imported/serialized accessibility annotation formats — following the `-formats` importer/parser convention. The DOM-ARIA backend itself stays in-package (it is the always-available web default, like `createWebClipboardBackend`); a native host (Electron, Tauri, a C/C++ shell) provides its platform backend in its `host-*` package (`createElectronAccessibilityBackend`).
- **Rust crate:** `flighthq-accessibility` (the AccessKit-backed native default — AccessKit is the canonical Rust accessibility tree library and maps cleanly onto Windows UIA / macOS NSAccessibility / Linux AT-SPI; `host-web` provides the wasm DOM-ARIA fill). 1:1 conformance against the TS package; the per-node metadata is a plain-data value seam, the tree projection is a backend trait.
- **`*Kind` strings** for accessible roles (`ButtonRole`, `ImageRole`, `TextRole`, …) — a string registry mirroring WAI-ARIA roles, vendor-prefixed for custom roles, so a role round-trips identically through DOM ARIA, native APIs, and scene serialization with no symbol↔string seam.

## Bronze

The minimum viable a11y exposure: attach a name/role/description to a display object and have the DOM backend mirror it as ARIA. Fills the "no accessibility category at all" hole with the 20% that covers most content — labeling interactive and image nodes for screen readers.

Types in `@flighthq/types` first (`Accessibility.ts`):

- `AccessibleRole` — open string union of WAI-ARIA roles; `*Role` kind constants: `ButtonRole`, `ImageRole`, `TextRole`, `LinkRole`, `HeadingRole`, `CheckboxRole`, `GroupRole`, `PresentationRole` (bare names reserved; vendor-prefix custom).
- `AccessibilityProperties` — the plain-data per-node descriptor (OpenFL's `AccessibilityProperties`): `name` (accessible name), `role: AccessibleRole`, `description`, `silent` (boolean — excluded from the tree), `focusable` (boolean). `Readonly` at rest.
- `AccessibilityBackend` — the projection seam: `applyAccessibleNode(handle, props)`, `removeAccessibleNode(handle)`, `setAccessibleTreeRoot(handle)` — plain-data in, opaque per-node `handle` out (a DOM element on web, a native node id elsewhere).

Functions in `@flighthq/accessibility`:

- `createAccessibilityProperties(): AccessibilityProperties` — explicit allocation.
- `setNodeAccessibility(node, props)` / `getNodeAccessibility(node): AccessibilityProperties | null` — attach/read the descriptor on the node runtime slot (sentinel `null` when none set).
- `setAccessibleName(node, name)`, `setAccessibleRole(node, role)`, `setAccessibleDescription(node, text)` — common-path field setters that lazily ensure the descriptor.
- `syncAccessibilityTree(root)` — walk the graph from `root`, push every non-`silent` descriptor through the backend, prune removed nodes. The single explicit pass the caller invokes (no hidden per-frame work), mirroring the explicit update-pass philosophy.
- Backend seam: `getAccessibilityBackend()`, `setAccessibilityBackend(backend | null)`, `createWebAccessibilityBackend()` — DOM backend maps `role`→`role=""`, `name`→`aria-label`, `description`→`aria-describedby`, `silent`→`aria-hidden`, over an overlay element layer positioned by node bounds.
- `isAccessibilitySupported(): boolean` — sentinel-style capability probe (false when no backend/host can expose a tree).

## Silver

Competitive and solid: matches a well-regarded a11y layer (the level Pixi's accessibility plugin, or a serious canvas/WebGL UI toolkit, ships). State, focus order, live announcements, and cross-backend consistency.

Types (`@flighthq/types`):

- `AccessibilityProperties` extended with state fields: `disabled`, `selected`, `checked` (`boolean | 'mixed'`), `expanded`, `pressed`, `required`, `invalid`, `readonly`, `valueText`, `valueNow`/`valueMin`/`valueMax` (range widgets, `-1` sentinel for unset), `level` (heading/tree depth), `keyShortcuts`, `placeholder`.
- `AccessibilityRelations` — `labelledBy`, `describedBy`, `controls`, `owns`, `activeDescendant` (node references / id lists) for composite widgets.
- `TabOrder` model: `tabIndex` field (OpenFL `tabIndex`; `-1` = focusable-not-in-order, `0` = natural order), `tabEnabled`, `tabChildren` on the descriptor.
- `AccessibilityLiveSetting` — `'off' | 'polite' | 'assertive'` for live-region announcements.
- `AccessibilityFocusSignals` payload types (`onFocusChange`, `onAccessibleAction`).

Functions (`@flighthq/accessibility`):

- Tab order: `getAccessibilityTabOrder(root, out): readonly Node[]` — compute the ordered focusable set honoring `tabIndex`/`tabEnabled` and document/spatial order, into an `out` array (no per-call allocation in the hot path). `getNextAccessibleFocus(root, current): Node | null` / `getPreviousAccessibleFocus(root, current): Node | null` for Tab/Shift-Tab traversal (sentinel `null` at the ends, with wrap option).
- Programmatic focus: `focusAccessibleNode(node): boolean`, `blurAccessibleFocus(): boolean`, `getAccessibleFocus(): Node | null` — delegates to the shared focus state interaction uses; returns sentinel `false` when the node is not focusable.
- State setters mirroring Bronze's name/role: `setAccessibleState(node, partial)`, `setAccessibleChecked`, `setAccessibleSelected`, `setAccessibleExpanded`, `setAccessibleDisabled`, `setAccessibleValue(node, now, min, max, text)`.
- Relations: `setAccessibleRelations(node, relations)`, `linkAccessibleLabel(node, labelNode)`.
- Live announcements: `announceAccessibility(message, live)` — push a transient message into a live region without a node (status/toast). Backend gains `announce(message, setting)`.
- Signals (opt-in, per the signal rule): `enableAccessibilityFocusSignals(root)` enabling `AccessibilityFocusSignals` — `onFocusChange(node)`, `onAccessibleAction(node, action)` (e.g. screen-reader-invoked "click"/"increment"); inert until enabled. The DOM backend wires its overlay elements' `focus`/`click`/`keydown` into these.
- Incremental sync: `invalidateAccessibleNode(node)` + `syncAccessibilityTree(root)` only re-projecting dirty subtrees, so the pass scales with churn not tree size. `disposeAccessibilityTree(root)` (`dispose*` — detaches overlay elements/listeners, releases to GC).
- Cross-backend consistency: a shared role-requirement validation (`validateAccessibleNode(node): readonly AccessibilityIssue[]`) returning data, not throwing — flags a button with no name, a range with no value, etc.

## Gold

Authoritative / AAA: the canonical accessibility reference for a graphics SDK. Exhaustive role/state coverage, full keyboard interaction patterns, performance, error handling, tests, docs, and 1:1 Rust parity.

Types (`@flighthq/types`):

- Full WAI-ARIA 1.2 role registry as `*Role` kinds (`SliderRole`, `ProgressbarRole`, `TabRole`, `TablistRole`, `TabpanelRole`, `MenuRole`, `MenuitemRole`, `TreeRole`, `TreeitemRole`, `GridRole`, `RowRole`, `CellRole`, `ComboboxRole`, `ListboxRole`, `OptionRole`, `DialogRole`, `AlertRole`, `TooltipRole`, `SwitchRole`, `RadioRole`, `RadiogroupRole`, `SpinbuttonRole`, `SeparatorRole`, `StatusRole`, `LandmarkRole` family, …), each with its required-property contract in `accessibility-formats`.
- `AccessibilityAction` registry (`'press' | 'increment' | 'decrement' | 'expand' | 'collapse' | 'scrollIntoView' | 'setValue' | 'showContextMenu' | …`) — the actions a native AT can invoke back on a node, mirroring AccessKit's action model so TS↔Rust map 1:1.
- `AccessibilityNodeSnapshot` — a serializable flattened tree node (role, name, state, bounds, children, actions) for the auditable accessibility tree used by tests and devtools, and for the parity differ.
- `VirtualCursorPosition` / reading-order types for non-DOM (native/canvas-only) traversal.
- `AccessibilitySettings` — observed user preferences: `prefersReducedMotion`, `prefersHighContrast`, `prefersReducedTransparency`, `forcedColors`, `prefersContrastMore`, `screenReaderActive` — over the backend (web matches `prefers-*` media queries; native reads OS settings).

Functions (`@flighthq/accessibility`):

- Full composite-widget keyboard interaction patterns as data + helpers (arrow-key navigation for `menu`/`tree`/`grid`/`listbox`/`tablist`, type-ahead, Home/End, roving tabindex): `createAccessibilityKeyHandler(role)` returning the canonical key map for a role, `dispatchAccessibilityAction(node, action, value)`.
- User-preference seam: `getAccessibilitySettings(): AccessibilitySettings`, `onAccessibilitySettingsChange(listener): () => void` (the `on*` over backend `subscribe*` pattern), so motion/contrast-sensitive content can respond — the bridge other packages (`tween`, `effects`) read for reduced-motion.
- Tree snapshot + audit: `captureAccessibilityTree(root): AccessibilityNodeSnapshot` (the serializable tree), `auditAccessibilityTree(root): readonly AccessibilityIssue[]` — full WCAG-adjacent ruleset (missing names, role/state mismatches, focus traps, orphaned `labelledBy`, contrast where measurable), returning data.
- Focus management: focus trapping (`trapAccessibleFocus(scopeRoot) / releaseAccessibleFocus(handle)` — `acquire`/`release` bracket for modal dialogs), focus restoration, `scrollAccessibleNodeIntoView(node)`, spatial/2D directional focus (`getDirectionalAccessibleFocus(current, direction)`) for canvas/WebGL content with no DOM order.
- Performance: dirty-tracking with a frame-budgeted incremental `syncAccessibilityTree` (process N dirty nodes per call), pooled overlay-element reuse on the DOM backend, and bounds-driven overlay positioning batched with the render update pass. `destroyAccessibilityBackendResources(backend)` (`destroy*`) for native-handle teardown.
- Backend completeness: `createWebAccessibilityBackend` covers the full ARIA surface (relations, live regions, virtual focus, `inert`, focus overlays) and degrades gracefully; `createElectronAccessibilityBackend` (in `host-electron`) over the OS tree; documented `AccessibilityBackend` contract so `host-tauri`/`host-capacitor`/native shells implement it identically.
- 1:1 Rust parity: `flighthq-accessibility` over AccessKit, conformance-tested via `captureAccessibilityTree` snapshots compared TS↔Rust in the parity matrix; the per-node descriptor is a mixable value-typed leaf.
- Docs + tests: a functional/example scene demonstrating a fully keyboard-navigable, screen-reader-labeled UI across DOM and (announced) native backends; colocated unit tests per source file; snapshot conformance baselines for the role/state tables.

## Boundaries

- **Hit testing and pointer/keyboard event dispatch stay in `@flighthq/interaction`.** `accessibility` adds the _semantic_ layer (name/role/state/order) on top; it reads interaction's focus state but does not own pointer routing.
- **Raw input normalization stays in `@flighthq/input`.** Tab/arrow keys arrive as normalized input; `accessibility` interprets them into focus moves, it does not capture devices.
- **Visual focus rings / highlight rendering stay out of this package** — drawing a focus indicator is a `displayobject`/renderer concern driven by the `onFocusChange` signal, not part of the a11y tree projection.
- **Native OS accessibility-API adapters live in `host-*` packages**, not here. The package ships only the always-available DOM-ARIA web backend (and, in Rust, the AccessKit native default); platform-specific bridges are host adapters, matching `clipboard`/`notification`.
- **Role→ARIA tables, role-requirement contracts, and imported annotation formats live in `@flighthq/accessibility-formats`**, keeping the core package free of large lookup data and tree-shakable.
- **Internationalization / text direction / language tagging is `@flighthq/i18n`'s domain** (a separate missing-domains package); `accessibility` consumes a `lang`/`dir` value but does not own localization.
- **Color-contrast _computation_ may live in `@flighthq/materials` or a color util**; `accessibility` calls it for audits but does not reimplement color math.

## Open design questions

- **Metadata location: runtime slot vs. entity field.** Does `AccessibilityProperties` attach as a nullable runtime slot (matching the interaction-signals subsystem pattern, keeping the entity lean and tree-shaking a11y out when unused) or as an optional entity field? The runtime slot is more consistent with the "entity knows nothing about the subsystem" rule, but a11y metadata is arguably authored content the way `name` is. Leaning runtime slot.
- **DOM backend strategy: overlay elements vs. a shadow tree.** Positioned transparent overlay elements (one per accessible node, like Pixi) are simple and battle-tested but cost layout; a single off-screen semantic mirror tree decouples from render bounds but complicates focus and hit correlation. Which is the default web backend?
- **How tightly to couple focus to `interaction`.** Is there a single shared focus-state primitive (ideally in `@flighthq/node` as a feature alias so both packages read it) or does `accessibility` own focus and `interaction` defer to it? Avoiding two focus sources of truth is the real constraint.
- **`tabIndex` semantics:** mirror OpenFL/Flash exactly (custom tab-order with `tabIndex`/`tabChildren`) or adopt HTML's `0`/`-1`/positive convention? They conflict; the spec leans HTML's model with an OpenFL-compatible field mapping in `-formats`.
- **Per-frame sync vs. explicit invalidation.** Bronze does an explicit full `syncAccessibilityTree`; Silver/Gold add dirty-tracking. Where is the line for "the caller must call sync" vs. "wire it into the render update pass" without violating the no-hidden-work rule? Likely: always explicit, but offer an opt-in `attachAccessibilityToRenderUpdate` helper.
- **Native canvas/WebGL with no DOM:** on native (Rust/AccessKit) there are no overlay elements — the tree is virtual. Confirm `captureAccessibilityTree` is the shared abstraction both DOM and native project from, so conformance compares the _semantic_ tree, not the DOM realization.
- **Should `accessibility-formats` exist at Bronze or be deferred?** The role tables are small at Bronze; the split earns its keep only once the full WAI-ARIA requirement contracts arrive at Gold. Start in-package, extract when the data grows.
