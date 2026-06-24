---
package: '@flighthq/tray'
updated: 2026-06-24
basedOn: ./review.md
---

# tray — Assessment

Sorted from `review.md` (score `solid — 82`). The prior `reviews/depth/tray.md` (48/100) and `reviews/maturation/depth/tray.md` roadmap are absorbed and superseded by the review and may be removed once this assessment lands. The charter is a stub (North star, Boundaries, Decisions all `TODO`), so most of "what good means here" is an open design question — which keeps `Recommended` deliberately small. The package is in good shape; the bulk of remaining distance to authoritative is either cross-package (the `host-electron` native backend, the Rust mirror), cross-worktree, or a charter decision (theme-aware icons, the naming ruling, the balloon/notification boundary). Those are routed to the charter's Open directions, not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/tray` (or its already-owned `@flighthq/types/src/Tray.ts` header), no cross-package coupling, no breaking change, no open design decision.

- **Return `Readonly<RectangleLike> | null` from `getTrayIconBounds`.** Today the public function declares an inline structural literal `Readonly<{ height; width; x; y }> | null` (`67dc46d64:tray.ts:127-131`), while the backend method it delegates to (`TrayBackend.getBounds`) is already typed `RectangleLike | null` in `@flighthq/types`. Reference the shared header type so the field set has one source. The shape is identical, so this is **not a breaking change** — it is a types-first single-source fix, plus the `RectangleLike` type-import. Peer `screen` already uses `RectangleLike` for the same shape. — review.md (Contract & docs fit, defect 1; Gaps).

- **Exercise `setTrayIgnoreDoubleClickEvents` through its own free function.** Its `describe` block (`67dc46d64:tray.test.ts:571-584`) calls `backend.setIgnoreDoubleClickEvents(...)` and `getTrayBackend().setIgnoreDoubleClickEvents(...)` directly; the exported free function is imported but never invoked, so its one-line body is uncovered even though `exports:check` is satisfied by the `describe` name. Re-point the test at `setTrayIgnoreDoubleClickEvents(tray, true)` (mirroring every other setter's test) and assert the backend state. Pure within-package test fix. — review.md (Gaps; Notes for status verification).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another worktree/doc owner, or is larger than a sweep. Each carries why.

- **`@flighthq/host-electron` realization of the new `TrayBackend` methods** (`setIcon`, `setTemplate`, `setPressedIcon`, `displayBalloon`, `removeBalloon`, `getBounds`, `getCapabilities`, `getTitle`, `getTooltip`, `isDestroyed`, `listIds`, `popUpContextMenu`, `setIgnoreDoubleClickEvents`) plus the `ElectronApi` interface extension. **Parked:** cross-package (a different package domain, outside the tray worktree's primary scope) and the single largest distance-to-authoritative gap — the seam is untested end-to-end without it. Routed to Open directions (ownership).

- **Extend `flighthq-tray` to the full TS surface + record divergences.** The Rust crate is stranded at the pre-session 48-surface: it exports the _old_ `set_tray_context_menu` and lacks `set_tray_icon`, `display_tray_balloon`, `TrayEventData`, `get_tray_capabilities`, `is_tray_destroyed`, `get_tray_icon_bounds`, and the rest. **Parked:** cross-worktree (the `rust` worktree), and it needs conformance-map entries (the `startTrayIconAnimation` TS-only divergence, the `iconTemplate` → `is_template` rename). Routed to Open directions.

- **Theme-aware icon set** (`TrayIconOptions.iconLight`/`iconDark` or an `iconDelegate`). **Parked:** needs a design decision — pass-both-at-creation (self-contained, no new import) vs. a delegate that pairs with `@flighthq/platform` theme signals (cross-package). Roadmap Gold. Routed to Open directions.

- **Linux/AppIndicator edge coverage** — `mouseMove` throttling guidance, scroll/wheel events, GTK drag-and-drop edge cases. **Parked:** requires real native-host testing a fake backend cannot reach; the capability-flag honesty (`clickEvents: false`) is the in-box answer and is already present.

- **A capability-degradation example / anchoring recipe** (`getTrayCapabilities` gate before balloon/bounds; `getTrayIconBounds` → position an `@flighthq/application` window/popover). **Parked:** lives in the examples/docs tooling, not the package; the anchoring recipe also pulls in `@flighthq/application` (cross-package). High user value, but not a within-package source sweep.

- **Promote the `Tray` vs `TrayIcon` naming ruling into `charter.md › Decisions`.** The in-session rename to `setTrayIconContextMenu` (all `TrayIcon`-entity mutators use `setTrayIcon*`) is sound and self-consistent but recorded only in `status.md`. **Parked:** the `Decisions` ledger is human-gated and append-only — promotion is the user's blessing, not an assessor edit. Routed to Open directions.

- **Codebase-map Package-Map line is stale.** The entry still describes the 48-surface ("icon, tooltip, title, context menu, click events") and the inbound-host-event paragraph still names the old `setTrayContextMenu`. **Parked:** the codebase map is an admin doc owned by the user, not a tray-cell edit. Candidate revision surfaced, not acted on.

- **Bless the `TrayBalloonOptions` / `@flighthq/notification` boundary.** The session's verified answer (keep separate — balloons are Win32 tray-specific, notifications are OS-agnostic push) is correct but unrecorded. **Parked:** a cross-package boundary ruling for the charter. Routed to Open directions.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these; the assessment confirms they are the forks that keep the bulk of the backlog parked:

1. **North star** — confirm the bar: a thin, fully-typed command-capability seam whose defining value is _honest cross-platform capability modeling_ (`getTrayCapabilities`), not papering over OS divergence.
2. **Promote the `Tray` vs `TrayIcon` naming ruling** into `Decisions` (the `setTrayIconContextMenu` rename and the "all `TrayIcon` mutators are `setTrayIcon*`" convention).
3. **Theme-aware icon mechanism** — pass-both-at-creation vs. an `@flighthq/platform`-coupled delegate.
4. **`TrayBalloonOptions` vs `@flighthq/notification`** — bless "kept separate" as a recorded boundary.
5. **`host-electron` realization ownership** — when/by whom the native backend is extended; it gates the seam's end-to-end validity.
6. **Rust conformance plan** — schedule extending `flighthq-tray` to the full surface and confirm the divergence-map entries (`startTrayIconAnimation` TS-only; `iconTemplate` → `is_template`).
