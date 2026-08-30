---
package: "@flighthq/accessibility"
updated: 2026-08-29
by: builder5
---

# accessibility — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-08-29 — Explicit Host provider migration

- Replaced ambient custom/host/sentinel resolution with one top-level `accessibility.provider` command slot. All five free commands now take `HasAccessibilityProvider` first; Web publishes the stable Entity `webAccessibilityBackend`, while Electron, Tauri, and Capacitor preserve empty Accessibility groups.
- Moved the complete visually-hidden ARIA DOM implementation to `@flighthq/host-web`. `createWebAccessibilityBackend(container?)` preserves owned versus borrowed roots, tracked-node/live-region identity, clear/reuse, subtree removal, idempotent destroy, and terminal anti-resurrection. `destroyAccessibility(host)` makes the final provider-owner release reachable.
- Outcomes use `reason` as their sole discriminant. Set/clear/announce return only `ok | destroyed | no-dom`; remove additionally names `node-not-found`; focus additionally names `node-not-found | focus-not-moved`. No subject-free diagnostic or presence probe remains.
- The accepted red-before deletion evidence was a shadowed Web provider whose stale ARIA node remained connected after ambient custom precedence selected another backend. The replacement evidence passes two explicit provider subjects and proves independent publication and teardown.
- `AccessibilityDescriptor` is record-only adjacent material for the paused scene2d-dom/scene-document work, not the platform provider model; its type and paused-area documents were not edited. The other nine silent document-absence guards are filed separately in `agents/host-web-no-dom-outcomes.md` and are not part of this slice.
