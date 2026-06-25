---
package: '@flighthq/tray'
updated: 2026-06-25
basedOn: ./review.md
---

# tray — Assessment (merge gate)

Sorts the merge-gate findings in `./review.md` into actionable buckets. This assessment reasons over the `integration-b2824e3d8` delta against the approved baseline `origin/main` (`eb73c3d74`). The headline is the compile break: the delta cannot merge until the `@flighthq/types` header that the implementation is written against is carried into the same snapshot.

## Recommended (sweep-safe, within-package)

These are the within-package corrections that should ride along once the delta is made mergeable. They are sweep-safe (no cross-package design decision, no breaking churn beyond the pre-release latitude already in force).

- **Restore the `@flighthq/types/src/Tray.ts` header extension into the integration snapshot.** The implementation in `b2824e3d8:packages/tray/src/tray.ts` and its test import `TrayBalloonOptions`, `TrayCapabilities`, `TrayEventData` and a 19-method `TrayBackend` / extended `TrayEventType` that are absent from head's types. Without the header, nothing in the package compiles. This is the gating fix. (It edits `@flighthq/types`, so it is "within the cell" only in the sense that the header is the tray cell's own design surface — call it out to the integration worker explicitly; see the dispatch brief.)
- **Make `getTrayIconBounds` return the shared `RectangleLike`** instead of the inline `{ height; width; x; y }` literal at `b2824e3d8:packages/tray/src/tray.ts:127-131`. `RectangleLike` already exists in `@flighthq/types`; the geometry query should reuse it, not re-spell it.
- **Test `setTrayIgnoreDoubleClickEvents` through the exported free function**, not the backend method. The describe block at `b2824e3d8:packages/tray/src/tray.test.ts:571-584` calls `backend.setIgnoreDoubleClickEvents` / `getTrayBackend().setIgnoreDoubleClickEvents`; it should call `setTrayIgnoreDoubleClickEvents(tray, …)` so the public function is actually covered.

## Backlog (parked)

- **`host-electron` tray backend not updated** — the new 19-method seam has no concrete native backend exercising it. Parked: it is a cross-package change (`@flighthq/host-electron`) outside this cell, and is a completeness item rather than a merge blocker.
- **Rust `flighthq-tray` mirror stranded** at the pre-session surface (`set_tray_context_menu` only, none of the new functions). Parked: cross-worktree; belongs to the conformance bar, not this gate.

## Approved

_None. Approval is the user's verbal gate; this section is append-only and is filled only when the user blesses an item._

## Notes for the charter's Open directions

These are forks and scope questions the delta raised that should be settled by the user in a direction session, not decided by an agent:

- **Animated-icon helper placement.** Is `startTrayIconAnimation` (`b2824e3d8:packages/tray/src/tray.ts:226-235`) in-scope for `tray`, or does the `setInterval`-driven animation loop belong in a timer/animation primitive that `tray` composes over?
- **Scope of the Windows/macOS-specific surface.** Balloons (`displayTrayBalloon`/`removeTrayBalloon`), macOS template/pressed icons (`setTrayIconTemplate`/`setTrayPressedIcon`), and ignore-double-click are Electron-shaped. Confirm this is the committed canonical scope versus a trim toward a smaller cross-platform core.
- **Cross-impl completeness as the bar.** Whether "authoritative" for `tray` requires the `host-electron` backend and the Rust mirror to track the seam, and on what cadence.
