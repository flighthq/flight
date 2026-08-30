---
package: '@flighthq/accessibility'
role: package
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

The complete accessibility bridge: a semantic node model (ARIA-aligned roles + states + value + label/description + bounds + parent link), focus control, and polite/assertive live announcements. Every command takes a `HasAccessibilityProvider` Host trait first, so the caller selects the exact provider that owns the mirrored tree. Web publishes a stable Entity provider at `webHost.accessibility.provider`; native hosts omit that optional slot until they have a real implementation. Plain-data nodes, explicit Host commands, and method-tight named outcomes form the platform-suite command-capability shape.

## Boundaries

- **Platform-suite command capability.** Flat free functions take `HasAccessibilityProvider` first; the **provider holds the mirrored tree** (like `storage`'s backend holds the store), and the app issues node/focus/announce commands. There is no ambient resolver, override precedence, sentinel, operation probe, or host enabler.
- **Depends on `@flighthq/types`.** The Web provider and all DOM configuration live in `@flighthq/host-web`. No display object, renderer, or scene graph enters this package — the caller maps its UI onto accessibility nodes with `bounds`.
- **Semantics + focus + announce, not rendering.** It publishes what an element *is* (role/label/state) and where (bounds), not how it looks. Visual focus rings, hit-testing, and pointer/keyboard input are `@flighthq/interaction`/`@flighthq/input`'s; accessibility only reflects semantics to assistive tech.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Command capability; the backend is the tree holder.** No separate tree entity — `setAccessibilityNode(node)` registers/updates a node (keyed by `node.id`, parented by `node.parentId`) in the backend's mirrored tree; `removeAccessibilityNode(id)` drops it (and its subtree); `clearAccessibilityTree()` empties it. `setAccessibilityFocus(id)` moves platform focus; `announceAccessibility(message, liveness)` speaks a transient message. This matches the suite's command-capability convention (`storage`, `clipboard`) rather than inventing a stateful tree object the caller ticks.
- **[2026-07-10] ARIA-aligned plain-data nodes in `@flighthq/types`.** `AccessibilityNode = { id; role; label?; description?; value?; parentId?; bounds?; states? }`; `AccessibilityRole` = open string union of ARIA roles (`button`/`checkbox`/`slider`/`heading`/`textbox`/`list`/`listitem`/`dialog`/…, vendor-prefixable); `AccessibilityState` = the boolean/enum state set (`disabled`/`checked`/`expanded`/`selected`/`pressed`/`busy`/…); `AccessibilityLiveness` = `'polite' | 'assertive'`; plus the `AccessibilityBackend` seam. Header owns them all.
- **[2026-07-10] Web backend = a visually-hidden ARIA DOM overlay.** `createWebAccessibilityBackend(container?)` maintains a `Map<id, HTMLElement>` in a hidden (clip-rect / `sr-only`) container (default appended to `document.body`), each node an element carrying `role` + `aria-*` reflecting label/description/value/states, parented per `parentId`; focus calls `element.focus()`; announcements write to an `aria-live` region. Immediate reflection per command (a batched flush is an open direction). No web API present → sentinel no-op, no throw.
- **[2026-08-29] Accessibility is an explicit Host provider.** The five commands take `HasAccessibilityProvider` first and return reason-only, method-tight outcomes. Web alone publishes `accessibility.provider`; Electron, Tauri, and Capacitor keep the slot absent. `AccessibilityBackend` is an Entity with required, terminal, idempotent `destroy()`, reached through `destroyAccessibility(host)` by the owner that constructed or shared the provider. The DOM factory/default moved to `@flighthq/host-web`; no DOM reports `'no-dom'`, a destroyed provider reports `'destroyed'`, and no runtime presence probe survives.
- **[2026-08-29] AccessibilityDescriptor is adjacent paused material, not this provider model.** The plain descriptor belongs to the paused scene2d-dom/scene-document investigation. It remains untouched and must not be treated as an alternate platform Accessibility slot or pruned from this package's migration.

## Open directions

1. **Batched flush.** A `beginAccessibilityUpdate`/`flush` bracket so a frame's many node updates reflect to the DOM once, not per-call — a performance follow-on over the immediate-reflect default.
2. **Interaction bridge.** An opt-in adapter that derives nodes from `@flighthq/interaction` hit regions + `@flighthq/scene2d` bounds, so common widgets publish semantics automatically instead of by hand.
3. **Keyboard focus order / tabindex model.** Explicit focus-traversal order and roving-tabindex helpers over the flat node set.
