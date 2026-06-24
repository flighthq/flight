---
package: '@flighthq/tray'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/tray.md
  - source
  - changes.patch
  - charter.md
---

# tray — Review

Evidence: `incoming/builder-67dc46d64/head/packages/tray/` + the bundle's `changes.patch`. Findings reference `67dc46d64:<path>`. The prior depth review (`reviews/depth/tray.md`, 48/100) and the maturation roadmap (`reviews/maturation/depth/tray.md`) both still exist in the tree; this survey absorbs and supersedes them. The charter is a stub (only "What it is" is filled; North star, Boundaries, Decisions, Open directions are all `TODO`), so most of "what good means here" is judged against the codebase-map AAA standard and the platform-suite seam pattern, with the silences flagged as candidate Open directions.

## Verdict

`solid — 82/100`. A single-session jump from a lowest-common-denominator stub (48) to a near-complete tray seam: 23 free functions, a fully-typed `TrayBackend` with 19 methods, a 17-member event taxonomy, a rich `TrayEventData` payload, a capability-flags interface, Windows balloons, macOS template/pressed icons, geometry query, and an animated-icon helper — all over the canonical command-capability shape with a complete web no-op/sentinel backend and 50 colocated tests. The status doc's inventory checks out against source almost exactly. The 82 (below the worker's self-estimated 88) reflects this review's distance-to-authoritative bar: the seam is excellent and the surface is broad, but it is a seam with **no concrete native backend exercising it** (`host-electron` not updated), the **Rust mirror is stranded at the old 48-surface**, the public `getTrayIconBounds` return type **drifts from the shared `RectangleLike` header type**, and one exported function's tests exercise the backend method rather than the free function. None of these are correctness bugs in the TS — they are completeness and contract-fit gaps on the road to an authoritative, cross-impl tray library.

## Present capabilities (verified against source)

**Free-function surface** (`tray.ts`, 23 exported functions, all alphabetized, `index.ts` a thin `export *` barrel). Lifecycle (`createTrayIcon` → `TrayIcon | null` with correct `-1`→`null` sentinel translation, `destroyTrayIcon`, `isTrayDestroyed`, `getTrayIcons` over `listIds`). Mutators (`setTrayIcon` — the headline runtime-icon-swap fix; `setTrayIconTooltip`/`Title`/`Template`/ `PressedIcon`, `setTrayIconContextMenu`, `setTrayIgnoreDoubleClickEvents`). Getters (`getTrayIconTitle`/ `Tooltip`/`Bounds`, `getTrayCapabilities`). Menu (`popupTrayContextMenu` with optional `Vector2Like` position). Balloons (`displayTrayBalloon`/`removeTrayBalloon`). Events (`onTrayEvent` over the rich payload). The backend seam (`getTrayBackend`/`setTrayBackend`/`createWebTrayBackend`) matches the platform suite exactly: lazy web default in `getTrayBackend`, module-level `_backend` at file bottom, no top-level side effects. `setTrayIcon`'s implementation is reused by `startTrayIconAnimation` so the animation helper is a true thin composition, not a parallel path.

**`startTrayIconAnimation`** (`67dc46d64:tray.ts:226-235`). Cycles frames via `setInterval`, sets frame 0 immediately, returns a `clearInterval` stop closure, and early-returns a no-op stop on empty frames. **No module-level timer/state** — the caller owns the handle — so it stays side-effect-free and tree-shakable, satisfying the roadmap's hard constraint on this helper. Covered with `vi.useFakeTimers` for cycle/wrap, stop, and empty-frames.

**Types-first header** (`packages/types/src/Tray.ts`, exported from the barrel at `67dc46d64:packages/types/src/index.ts:453`). `TrayEventType` (17 members), `TrayEventData` (rich payload: `id`/`type`/four modifier flags/`bounds`/`position`/`dropFiles`/`dropText`), `TrayBalloonOptions`, `TrayCapabilities` (6 flags), `TrayIconOptions` (+`iconTemplate`), `TrayIcon` (minimal `{ id }` handle), and `TrayBackend` (19 methods). The interface is the design surface and every free function delegates straight through it. Inline comments document per-platform availability member-by-member — genuinely useful for a domain this platform-divergent.

**Web backend** (`createWebTrayBackend`, `67dc46d64:tray.ts:32-99`). Every `TrayBackend` method implemented as a no-op/sentinel: `create` → `-1`, getters → `''`/`null`/`[]`, `isDestroyed` → `true`, `subscribe` → no-op unsubscribe, `getCapabilities` → the all-false `WEB_CAPABILITIES` constant. Fully guarded; nothing throws. Verified by the `createWebTrayBackend` test which exercises all 19 methods.

**Tests** (`tray.test.ts`, 50 `it`s across 23 `describe` blocks — one per exported function, verified by count). A full fake backend models per-icon state and an event-fire hook; coverage includes rich payload delivery, drop-file payloads, balloon-event sequencing, unsubscribe, capability degradation, and the animation timer behavior. `exports:check` should pass: every exported name has a matching `describe`.

## Gaps (vs the AAA tray target; charter silent, so codebase-map standard applies)

- **No concrete native backend exercises the seam.** `createElectronTrayBackend` in `@flighthq/host-electron` (and the `ElectronApi` interface) was not extended for any of the 13 new `TrayBackend` methods. The seam is now broad but **end-to-end-untested** — an unexercised seam drifts from what a real `Tray` actually does (which events fire where, balloon semantics, bounds units). The roadmap explicitly flagged "the seam is meaningless without one concrete native backend." This is the single largest distance-to-authoritative gap, and it is cross-package.
- **Rust mirror stranded at the old surface.** `crates/flighthq-tray` (present in the bundle head) still exports only the pre-session set — `set_tray_context_menu` (the _old_ name, pre the `setTrayIconContextMenu` rename), and **no** `set_tray_icon`, `display_tray_balloon`, `TrayEventData`, `get_tray_capabilities`, `is_tray_destroyed`, `get_tray_icon_bounds`, etc. The conformance goal is 1:1; today TS is at ~82 and the crate is at ~48, and the rename means even the shared functions diverge by name. Cross-worktree.
- **`getTrayIconBounds` return type drifts from the header.** `TrayBackend.getBounds` is typed `RectangleLike | null` in `@flighthq/types` (`67dc46d64:Tray.ts:104`), but the public free function declares its return as an **inline structural literal** `Readonly<{ height; width; x; y }> | null` (`67dc46d64:tray.ts:127-131`), not `Readonly<RectangleLike>`. It compiles (same shape), but the public surface re-spells the field set instead of referencing the shared header type — a single-source-of-truth drift. The maturation roadmap asked for `Rectangle | null` via the geometry convention; peer `screen` consistently uses `RectangleLike` for the same shape.
- **`setTrayIgnoreDoubleClickEvents` is not exercised through its own free function.** Its `describe` block (`67dc46d64:tray.test.ts:571-584`) calls `backend.setIgnoreDoubleClickEvents(...)` directly and the web case calls `getTrayBackend().setIgnoreDoubleClickEvents(0, true)` — the exported `setTrayIgnoreDoubleClickEvents` free function is imported but never invoked. `exports:check` is satisfied by name (a `describe` exists) but the function body is technically uncovered. The status doc acknowledges this.
- **No theme-aware icon set.** `TrayIconOptions.iconLight`/`iconDark`/`iconDelegate` (a single tray carrying light/dark variants resolved by the host, beyond the binary template flag) is absent. Roadmap Gold; needs a cross-package decision on how tray learns of theme changes without importing `@flighthq/platform`.
- **Linux/AppIndicator edge coverage is documented-but-untested.** `getTrayCapabilities().clickEvents` is the honest signal for menu-only trays, but `mouseMove` throttling, scroll/wheel events, and GTK drag-and-drop edge cases are deferred and require host testing.
- **No per-function platform-divergence docs beyond inline comments**, and no anchoring recipe (`getTrayIconBounds` → position an `@flighthq/application` window/popover) in any example. The single highest-value real-world addition (a capability-degradation example) does not exist.

## Charter contradictions

None. The charter's "What it is" — "a persistent OS notification-area icon with an icon image, tooltip/title, a context menu, and click events (Electron `Tray`, Tauri `TrayIcon`, NW.js `Tray`)" — matches the code exactly, and the application/dock-badge boundary it implies (delegated to `@flighthq/app`) is honored in source (`createWebTrayBackend`'s comment and the absence of any badge API). North star, Boundaries, and Decisions are all `TODO`, so there is no blessed rule to contradict. The `setTrayContextMenu` → `setTrayIconContextMenu` rename — the roadmap's blocking "design decision" (the `Tray` vs `TrayIcon` prefix asymmetry) — was taken in-session as "all `TrayIcon`-entity mutators use `setTrayIcon*`"; it is sound and self-consistent, but it is an **unrecorded** ruling that belongs in `charter.md › Decisions` rather than living only in the status log.

## Contract & docs fit

**Lives up to the contract:**

- **Full, unabbreviated names** — `setTrayIconTooltip`, `getTrayIconBounds`, `popupTrayContextMenu`, `setTrayIgnoreDoubleClickEvents`. Globally self-identifying.
- **Sentinels, not throws** — `createTrayIcon` → `null`, `getTrayIconBounds` → `null`, getters → `''`, `getTrayIcons` → `[]`, `isTrayDestroyed` → `true` on web. No throwing anywhere; web backend guards every method.
- **Types-first** — all shared types in `@flighthq/types/src/Tray.ts`, exported from the barrel; the `TrayBackend` interface is the design surface and was extended there first (the one drift is `getTrayIconBounds` re-spelling `RectangleLike`, noted above).
- **Correct teardown verb** — `destroyTrayIcon` (frees a non-GC native handle), not `dispose*`. Matches the verb rule.
- **No top-level side effects** — `_backend` is a lazily-populated module variable at file bottom; registration is opt-in via `setTrayBackend`; `startTrayIconAnimation` starts no module-level timer. `sideEffects: false` in `package.json` is honest.
- **Single `.` export**, deps limited to `@flighthq/types`. Packaging is clean.
- **`Readonly<>` discipline** — `Readonly<TrayIconOptions>`, `Readonly<TrayBalloonOptions>`, `Readonly<Vector2Like>`, `Readonly<TrayCapabilities>` return. Consistent.

**Defects / candidate revisions:**

- **`getTrayIconBounds` should return `Readonly<RectangleLike> | null`, not an inline literal.** The header already owns the type (`TrayBackend.getBounds`); the public function should reference it so the field set has one source. (Contract: types-first / `@flighthq/types` is the header layer.)
- **The `Tray`/`TrayIcon` prefix decision is unrecorded.** A blessed pre-release rename with no published consumers is exactly the kind of permanent ruling the contract says should land in `charter.md › Decisions` (append-only). Today it lives only in `status.md`. Candidate promotion (the user's gate).
- **Package Map line is stale.** The codebase-map entry still reads "system tray / menu-bar icon (icon, tooltip, title, context menu, click events)" — the _48-surface_ description. It no longer mentions runtime icon updates, template/pressed icons, balloons, rich events, bounds, or capabilities. The inbound-host-event paragraph also names `setTrayContextMenu` (the old name) as the tray's context-menu setter; it is now `setTrayIconContextMenu`. Both are candidate Package-Map revisions.
- **The `@flighthq/notification` cross-check is resolved but unrecorded.** The roadmap asked whether `TrayBalloonOptions` shares a contract with `@flighthq/notification`; the session's verified answer (keep separate — balloons are Win32 tray-specific) is correct and lives in status, but is a candidate Open-direction resolution for the charter, not yet blessed.

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** The likely bar: a thin, fully-typed command-capability seam over a swappable `TrayBackend`, with _honest cross-platform capability modeling_ (`getTrayCapabilities`) as the defining value — tray behavior diverges by OS more than almost any other capability, and an authoritative library's worth is in surfacing that divergence, not papering over it. Confirm.
2. **Promote the `Tray` vs `TrayIcon` naming ruling** into `Decisions` (all `TrayIcon`-entity mutators are `setTrayIcon*`; the context-menu setter is `setTrayIconContextMenu`).
3. **Theme-aware icon set.** Decide the mechanism: pass `iconLight`/`iconDark` at creation and let the backend pick (no new import, self-contained) vs. an `iconDelegate` callback that pairs with `@flighthq/platform` theme signals (heavier, cross-package). Roadmap Gold.
4. **`TrayBalloonOptions` vs `@flighthq/notification`.** Bless "kept separate" (Win32 tray-specific vs. OS-agnostic push) so it is a recorded decision, not an inferred one.
5. **`host-electron` realization ownership.** When/by whom the Electron backend is extended to the new seam — it is cross-package and gates the seam's end-to-end validity.
6. **Rust conformance plan & divergence map entries.** Confirm the intentional TS-only divergence for `startTrayIconAnimation` (Rust callers own their own timer/async task) and the `iconTemplate` → `is_template` field rename, and schedule extending `flighthq-tray` to the full surface.

## Notes for status verification (as-claimed → verified)

The worker status doc is accurate against the diff. Verified: 23 exported functions, 23 `describe` blocks, 50 `it`s; `TrayEventType` extended to 17 members and `TrayBackend` to 19 methods in `@flighthq/types/src/Tray.ts`; the `setTrayContextMenu` → `setTrayIconContextMenu` rename; the web backend's all-false capabilities and full no-op coverage; `startTrayIconAnimation`'s side-effect-free timer ownership. Verified deferrals: `host-electron` untouched, and the Rust crate confirmed still at the pre-session surface (`crates/flighthq-tray/src/lib.rs` exports `set_tray_context_menu` and lacks every new function). The self-estimated 88 is optimistic against this review's distance-to-authoritative bar (the stranded native backend and Rust mirror weigh against it), but every _inventory_ claim it makes is real. The status's two acknowledged surprises — the pre-existing `DOMRenderOptions.ts` ESLint ENOENT in another package, and `setTrayIgnoreDoubleClickEvents` being tested via the backend method rather than the free function — both check out.
