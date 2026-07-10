---
package: '@flighthq/accessibility'
crate: flighthq-accessibility
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# accessibility — Charter

## What it is

`@flighthq/accessibility` is the **assistive-technology cell** of the platform-integration suite — it exposes a canvas/game UI's semantics (roles, labels, states, focus) to screen readers and other assistive tech, which otherwise see only an opaque `<canvas>`. The app describes its interactive elements as plain-data accessibility nodes; a swappable backend mirrors them to the platform (a visually-hidden ARIA DOM overlay on web, native accessibility APIs on native hosts), handles focus, and makes live announcements.

It closes a category-level omission: a rendered-to-canvas Flight app is invisible to assistive tech until its semantics are published here.

## North star

The complete accessibility bridge: a semantic node model (ARIA-aligned roles + states + value + label/description + bounds + parent link), focus control, and polite/assertive live announcements — published through a `get/set/createWebAccessibilityBackend` seam so a native host reflects the same node commands to its OS accessibility layer. Plain-data nodes, flat command functions, sentinels not throws — the platform-suite command-capability shape.

## Boundaries

- **Platform-suite command capability.** Flat free functions over a swappable `AccessibilityBackend`; the **backend holds the mirrored tree** (like `storage`'s backend holds the store), the app issues node/focus/announce commands. `get/set/createWebAccessibilityBackend`; web backend always available, lazy, import-side-effect-free; returns sentinels, never throws.
- **Depends on `@flighthq/types`** (+ the DOM in the web backend only). No display object, no renderer, no scene graph — the caller maps its UI (display objects, layout) onto accessibility nodes with `bounds`; accessibility does not read the scene graph.
- **Semantics + focus + announce, not rendering.** It publishes what an element *is* (role/label/state) and where (bounds), not how it looks. Visual focus rings, hit-testing, and pointer/keyboard input are `@flighthq/interaction`/`@flighthq/input`'s; accessibility only reflects semantics to assistive tech.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Command capability; the backend is the tree holder.** No separate tree entity — `setAccessibilityNode(node)` registers/updates a node (keyed by `node.id`, parented by `node.parentId`) in the backend's mirrored tree; `removeAccessibilityNode(id)` drops it (and its subtree); `clearAccessibilityTree()` empties it. `setAccessibilityFocus(id)` moves platform focus; `announceAccessibility(message, liveness)` speaks a transient message. This matches the suite's command-capability convention (`storage`, `clipboard`) rather than inventing a stateful tree object the caller ticks.
- **[2026-07-10] ARIA-aligned plain-data nodes in `@flighthq/types`.** `AccessibilityNode = { id; role; label?; description?; value?; parentId?; bounds?; states? }`; `AccessibilityRole` = open string union of ARIA roles (`button`/`checkbox`/`slider`/`heading`/`textbox`/`list`/`listitem`/`dialog`/…, vendor-prefixable); `AccessibilityState` = the boolean/enum state set (`disabled`/`checked`/`expanded`/`selected`/`pressed`/`busy`/…); `AccessibilityLiveness` = `'polite' | 'assertive'`; plus the `AccessibilityBackend` seam. Header owns them all.
- **[2026-07-10] Web backend = a visually-hidden ARIA DOM overlay.** `createWebAccessibilityBackend(container?)` maintains a `Map<id, HTMLElement>` in a hidden (clip-rect / `sr-only`) container (default appended to `document.body`), each node an element carrying `role` + `aria-*` reflecting label/description/value/states, parented per `parentId`; focus calls `element.focus()`; announcements write to an `aria-live` region. Immediate reflection per command (a batched flush is an open direction). No web API present → sentinel no-op, no throw.

## Open directions

1. **Batched flush.** A `beginAccessibilityUpdate`/`flush` bracket so a frame's many node updates reflect to the DOM once, not per-call — a performance follow-on over the immediate-reflect default.
2. **Interaction bridge.** An opt-in adapter that derives nodes from `@flighthq/interaction` hit regions + `@flighthq/displayobject` bounds, so common widgets publish semantics automatically instead of by hand.
3. **Keyboard focus order / tabindex model.** Explicit focus-traversal order and roving-tabindex helpers over the flat node set.
