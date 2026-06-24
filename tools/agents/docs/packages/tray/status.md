---
package: '@flighthq/tray'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# tray — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/tray

**Session date**: 2026-06-24 **Previous score**: 48/100 (partial) **Estimated new score**: 88/100 (gold-approaching)

## Implemented APIs

### Types added/extended in `packages/types/src/Tray.ts`

- **`TrayEventType`** — extended from 3 events to 17: added `balloonClick`, `balloonClose`, `balloonShow`, `dragEnter`, `dragLeave`, `drop`, `dropFiles`, `dropText`, `middleClick`, `mouseDown`, `mouseEnter`, `mouseLeave`, `mouseMove`, `mouseUp` (full Electron tray event set; platform availability documented inline).
- **`TrayEventData`** — new rich event payload interface replacing bare `(id, event)`: fields `id`, `type`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`, `bounds: Readonly<RectangleLike> | null`, `position: Readonly<Vector2Like> | null`, `dropFiles: readonly string[] | null`, `dropText: string | null`. Modifier field names mirror `PointerEventData` for cross-package consistency.
- **`TrayBalloonOptions`** — new Windows balloon notification descriptor: `title`, `text` (required), plus optional `icon`, `iconType` (`'none'|'info'|'warning'|'error'`), `largeIcon`, `noSound`, `respectQuietTime`.
- **`TrayCapabilities`** — new capability flags interface: `balloon`, `bounds`, `clickEvents`, `dropFiles`, `pressedIcon`, `title`. Use `getTrayCapabilities()` before APIs that may silently no-op on some platforms.
- **`TrayIconOptions`** — extended with `iconTemplate?: boolean` for macOS template-image support.
- **`TrayBackend`** — extended with all new seam methods: `displayBalloon`, `getBounds`, `getCapabilities`, `getTitle`, `getTooltip`, `isDestroyed`, `listIds`, `popUpContextMenu`, `removeBalloon`, `setIcon`, `setIgnoreDoubleClickEvents`, `setPressedIcon`, `setTemplate`. `subscribe` re-typed from `(id, event)` callback to `(event: Readonly<TrayEventData>)` callback.

### New free functions in `packages/tray/src/tray.ts`

All alphabetically ordered, all with colocated tests.

- **`displayTrayBalloon(tray, options)`** — Windows balloon notification. No-op on macOS/Linux/web.
- **`getTrayCapabilities()`** — returns `TrayCapabilities` from the active backend.
- **`getTrayIconBounds(tray)`** — returns icon screen bounds as `{ x, y, width, height } | null`. Use for popover/window anchoring.
- **`getTrayIconTitle(tray)`** — getter for current title text (round-trip with `setTrayIconTitle`).
- **`getTrayIconTooltip(tray)`** — getter for current tooltip text (round-trip with `setTrayIconTooltip`).
- **`getTrayIcons()`** — enumerates live tray icon handles from backend's `listIds()`.
- **`isTrayDestroyed(tray)`** — guard for use-after-destroy; true on web.
- **`popupTrayContextMenu(tray, position?)`** — programmatic menu popup with optional `Vector2Like` position.
- **`removeTrayBalloon(tray)`** — dismisses active Windows balloon.
- **`setTrayIcon(tray, icon)`** — **most glaring Bronze fix**: runtime icon swap for status indicators/animations/theme changes.
- **`setTrayIconContextMenu(tray, items)`** — renames `setTrayContextMenu` to resolve the `Tray`/`TrayIcon` prefix asymmetry (see Naming Decisions).
- **`setTrayIconTemplate(tray, isTemplate)`** — macOS template-image flag for dark-mode menu bars.
- **`setTrayIgnoreDoubleClickEvents(tray, ignore)`** — macOS double-click collapse.
- **`setTrayPressedIcon(tray, icon)`** — macOS pressed/highlight icon (Electron `setPressedImage`).
- **`startTrayIconAnimation(tray, frames, intervalMs)`** — thin animated-icon helper. Caller owns the returned stop function. No module-level state; no side effects.

### Breaking change: `onTrayEvent` / `subscribe` signature

`onTrayEvent(listener: (id, event) => void)` is now `onTrayEvent(listener: (event: Readonly<TrayEventData>) => void)`. This is a deliberate pre-release API reshape (roadmap step 3). The `id` field is now `event.id`. All tests updated.

### Naming decision: `setTrayIconContextMenu` vs `setTrayContextMenu`

The roadmap flagged the `Tray`/`TrayIcon` prefix asymmetry as a blocking design decision (step 1). Decision taken: all free functions that operate on a `TrayIcon` entity use the `setTrayIcon*` prefix since the entity type is `TrayIcon`. `setTrayContextMenu` → `setTrayIconContextMenu`. This is a pre-release rename with no published consumers.

## Test coverage

50 tests covering all 23 exported functions. Key coverage:

- Fake backend exercises every `TrayBackend` method.
- `startTrayIconAnimation` tested with `vi.useFakeTimers()` for frame cycling, stop function, and empty-frames edge case.
- `onTrayEvent` tested for rich payload delivery, balloon events, drop file payloads, and unsubscribe.
- Web backend tested for all-false capabilities and full no-op/sentinel coverage.

## Deferred items and why

### `@flighthq/host-electron` realization

The `TrayBackend` seam is extended but `createElectronTrayBackend` in `@flighthq/host-electron` has not been updated. This is cross-package domain work (the host-electron package). Surface as a coordinated change: every new `TrayBackend` method (displayBalloon, getBounds, getCapabilities, getTitle, getTooltip, isDestroyed, listIds, popUpContextMenu, removeBalloon, setIcon, setIgnoreDoubleClickEvents, setPressedIcon, setTemplate) needs a corresponding Electron implementation plus an update to the `ElectronApi` interface.

### `TrayBalloonOptions` / `@flighthq/notification` cross-package check

The roadmap asks: does `TrayBalloonOptions` share fields with `@flighthq/notification`'s options? Balloons are a Win32-specific tray concept; notification options are cross-platform. Kept as separate types. They do not share a contract type in `@flighthq/types`. This is correct — no structural duplication in practice (`TrayBalloonOptions` has `largeIcon`/`noSound`/`respectQuietTime` which are Windows tray-specific; notifications are OS-agnostic push).

### Theme-aware icon set (`iconLight`/`iconDark` / `iconDelegate`)

Gold roadmap item: `TrayIconOptions.iconLight` / `iconDelegate` pairing with `@flighthq/platform` theme/appearance signals. Requires a cross-package design decision (how does tray subscribe to theme changes without importing platform?). Deferred — a delegate callback pattern would work but needs a naming convention decision.

### Rust parity (`flighthq-tray`)

The roadmap calls for 1:1 Rust parity. The crate exists but has not been extended in this session. All new TS names have obvious `snake_case` Rust mirrors (`set_tray_icon`, `popup_tray_context_menu`, `TrayEventData` with `snake_case` fields, `TrayBackend` trait extension). Record in conformance map: `iconTemplate: bool` → `is_template: bool` (field rename), `TrayBalloonOptions` fields are direct snake_case. Intentional divergence: `startTrayIconAnimation` is a TS-only convenience (Rust callers manage their own timer/async tasks); the conformance map should document this.

### Linux/AppIndicator edge cases

`getTrayCapabilities().clickEvents = false` is the documented signal for Linux/AppIndicator trays (menu-only, no click events). Full drag-and-drop edge cases, `mouseMove` throttling guidance, and scroll/wheel events on Linux are Gold items that require native host testing. Deferred.

## Concerns / surprises

- The ESLint run failed with `ENOENT: .../packages/types/src/DOMRenderOptions.ts` — a pre-existing missing file in another package. Did not affect tray; lint on tray files passed individually.
- The `setTrayIgnoreDoubleClickEvents` function is exposed as a free function (delegating to `backend.setIgnoreDoubleClickEvents`) consistent with all other setters, even though the roadmap's test example used the backend method directly. Both patterns work; the free function is the canonical call site.

## Suggestions for future sessions

1. **host-electron update** — highest-value follow-on. Without it the new seam methods are untested end-to-end.
2. **Rust parity** — extend `flighthq-tray` to mirror the full `TrayBackend` trait and `TrayEventData` struct. Record intentional divergences (animated-icon helper, TS-only convenience) in the conformance map.
3. **Theme-aware icon** — `TrayIconOptions.iconLight` / `iconDark` is a small, self-contained addition with no new cross-package imports (just pass both paths at creation, let the backend pick). A delegate callback approach requiring `@flighthq/platform` is heavier and should be a separate decision.
4. **`getTrayCapabilities` in examples/docs** — the single most useful addition for real-world consumers is knowing when balloon/bounds/clickEvents are unavailable. An example or inline doc showing the degradation pattern would be high-value.
