---
package: '@flighthq/screen'
status: solid
score: 85
updated: 2026-07-13
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - prior review (2026-06-25, refreshed 2026-07-09)
---

# screen — Review (live-tree survey, 2026-07-13)

> Supersedes the 2026-06-25 merge-gate review (`partial — 42, REJECT: does not build`). Its blocking finding is fully resolved: the type seam now exists in `@flighthq/types` — `Screen.ts` (25-field `ScreenInfo` incl. `dpi`, `touchSupport`, `monochrome`), `ScreenChangeEvent.ts` (`ScreenChangeKind`, `ScreenChangedMetrics`, payload-carrying event), `ScreenColorSpace.ts`, `ScreenMode.ts`, `ScreenOrientation.ts`, `ScreenSignals.ts`. The package compiles; the test file's divider comments are gone; and both previously-Approved items are implemented (verified below).

## Verdict

**solid — 85/100.** The strongest cell in the OS/device group after `storage`: 29 exports spanning enumeration (`getScreens`, `getPrimaryScreen`, `getScreenById`), point/rect-to-screen lookups (`getScreenNearestPoint`, `getScreenContainingRect`, `getScreenNearestRect`), DIP↔physical converters (4, all documented alias-safe), display modes (`getScreenModes`, `getScreenCurrentMode`), cursor queries, a payload-carrying change stream (`onScreenChange`), an opt-in signals group (`createScreenSignals`/`enableScreenSignals`/`attachScreenSignals`/`detachScreenSignals`/`disposeScreenSignals`), the Window Management multi-monitor upgrade (`requestScreenDetails`), and a Permissions-API watch (`onScreenDetailPermissionChange`). The web backend degrades cleanly to single-monitor with sentinels. What remains between this and authoritative is a small set of already-chartered behavior edges, not missing surface.

## Spot-verified against the prior review and charter

- **`getScreenNearestRect` now has distinct semantics** (charter Decision 2026-07-02, refresh note commit bd412dd6, verified at `screen.ts:604`): prefer a screen that fully contains the rect, else nearest-by-center-distance — genuinely different from `getScreenContainingRect`'s largest-overlap rule, mirroring Electron's `getDisplayMatching`/`getDisplayNearestPoint` split. The prior "two names, one body" finding is dead.
- **Test divider comments removed** (charter Decision 2026-07-02): `grep '// ---' screen.test.ts` is empty; 970-line suite with alphabetized describes mirroring the exports.
- **Permission watch landed:** `onScreenDetailPermissionChange` (`screen.ts:679`) wires `PermissionStatus.change` for `'window-management'` with cancel-safe async setup and a no-op unsubscriber sentinel — this closes the status.md "wire PermissionStatus.onchange" gap.
- **Change events carry payloads:** the web backend's `subscribe` diffs cached `ScreenInfo` per screen and emits `ScreenAdded`/`ScreenRemoved`/`ScreenMetricsChanged` with `changedMetrics` (`screen.ts:296-323`) — the seam a native host needs for hot-plug.
- Conventions: `sideEffects: false`, single-line barrel, lazy `_backend`, sentinels not throws, `Readonly<>` on inputs, out-params throughout (incl. `out: ScreenInfo[]` fills).

## Gaps (why not higher)

- **Late-subscribe + upgrade ordering (still true, charter Open direction):** `subscribe` captures `const detailsRef = _screenDetails` at subscription time (`screen.ts:330-336`), so a consumer that calls `onScreenChange` *before* `requestScreenDetails()` resolves never receives `screenschange` events from the upgraded details object. Subscribers must re-subscribe after upgrade; nothing re-wires them. This is the most user-visible behavioral trap in the package.
- **`refreshScreens` is a documented no-op on web** (`screen.ts:703`) — a hook whose web body does nothing and whose native contract ("backends should override via the seam") is not expressible in `ScreenBackend` (there is no `refresh` member to override). Either the backend grows an optional `refresh?()` or the export's contract stays vibes. Small seam-shape wrinkle.
- **Stable-id contract across hot-plug** for `ScreenInfo.id` remains undecided (charter Open direction) — matters for native backends keying window placement by screen.
- **Mode-setting is absent by design** (`getScreenModes` is read-only; no `setScreenMode`). Reasonable for web; a native fullscreen-exclusive story would need it — worth an explicit charter ruling so the absence reads as decided rather than missing.
- **Cheap web-derivable fields** (`monochrome`, `dpi`, `depthPerComponent`) still sentinel on web pending the chartered derive-vs-native decision.
- **Rust mirror unverified** — cross-tree, conformance entries unwritten.

## Charter fit

Both charter Decisions are implemented in source and can be retired to history at the next direction session. The four Open directions are still the right open set; this review adds the `refreshScreens`/backend-`refresh?()` seam question and the mode-setting scope ruling as candidates.

## Candidate open directions

- Late-subscribe re-wiring: have `requestScreenDetails` re-bind existing subscriptions (or document re-subscribe as the contract).
- Optional `ScreenBackend.refresh?()` so `refreshScreens` has a real seam to delegate to.
- Explicit ruling that display-mode *setting* is out of scope (or chartered for native).
