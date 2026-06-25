---
package: '@flighthq/screen'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/screen — merge gate (integration-b2824e3d8)

The review (`partial`, 35/100 as a _merge-fitness_ score) **rejects** the incoming delta: the screen package `src/` advanced to the 25-field / signals / multi-monitor implementation, but the `@flighthq/types` half it depends on (`ScreenMode`, `ScreenColorSpace`, `ScreenOrientation`, `ScreenChangeKind`, `ScreenChangedMetrics`, `ScreenTouchSupport`, the payload-carrying `ScreenBackend`, the new `ScreenSignals` module, and the expanded `ScreenInfo`) **is not present in the integration branch**. As integrated, neither `screen.ts` nor `screen.test.ts` type-checks.

That blocker is a **merge-integration repair**, not a within-`@flighthq/screen` source sweep — the fix lands in `@flighthq/types`, outside this package cell. So the within-package sweep set here is small; everything else is parked behind either the integration repair or an Open direction.

`Approved` is empty — approval is the user's verbal gate.

## Recommended

Sweep-safe: within `@flighthq/screen`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended." (None of these are mergeable until the type-seam blocker is resolved by the integration; they are the cleanups to apply _while_ fixing the build.)

- **Drop the test divider comments.** Remove the `// --- attachScreenSignals ---` / `// --- … ---` section headers in `screen.test.ts` (b2824e3d8:packages/screen/src/screen.test.ts:86 and siblings). The alphabetized `describe` names already carry the structure; the dividers violate the "avoid structural divider comments" source-style rule. — review.md (Tests & honesty)

## Backlog

Parked — each carries a reason: it lands outside this package, it waits on an Open direction, or it is a standing follow-up rather than a code change.

- **Restore the `@flighthq/types` screen seam in the integration.** Re-land the expanded `Screen.ts` (25-field `ScreenInfo`, `ScreenMode`, `ScreenColorSpace`, `ScreenOrientation`, `ScreenChangeKind`, `ScreenChangedMetrics`, `ScreenTouchSupport`, payload-carrying `ScreenBackend`) and the new `ScreenSignals.ts`, exported from the types barrel. **Parked from this cell:** the fix is in `@flighthq/types`, not `@flighthq/screen` — it is the _integration's_ job (see the dispatch brief), not a within-package recommendation. This is the gate to merge. — review.md (blocking finding)

- **Real display-mode enumeration / `getScreenNativeMode`.** `ScreenMode` + `getScreenModes` / `getScreenCurrentMode` are landed; web is correctly synthetic-single-mode. A real mode list and a `getScreenNativeMode` payload become real only once a native host enumerates. **Parked:** host-coupled — no payload to write until a native backend exists. — review.md (web-synthetic only)

- **Stable-id contract test.** A test asserting `ScreenInfo.id` is reconfiguration-stable. **Parked:** the contract is undecided (numeric vs string; what a host must honor across hot-plug) — the test cannot be written before the seam decision lands. Depends on Open direction #5. — review.md

- **Rust compile verification.** Run `cargo build -p flighthq-screen -p flighthq-host-winit` and fix any breakage; the builder sandbox had no cargo, so the Rust mirror is structurally consistent but uncompiled. **Parked:** requires a Rust-capable environment, outside a TS source sweep; a standing follow-up. — review.md (honesty check vs status.md)

- **`Signal<Fn>` vs `Signal<T>` divergence note.** Record in the conformance/divergence map that `ScreenSignals` types its signals by _function type_ (TS convention) while the Rust port's locked decision is `Signal<T>` by _payload_. **Parked:** cross-package doc edit (the divergence map), and moot until the `ScreenSignals` type itself is restored. — review.md

- **Package Map line expansion.** The codebase-map Package Map entry for `@flighthq/screen` still reads "display enumeration, work area, scale factor" — the feature now also owns coordinate conversion, cursor queries, change events, display modes, and a signals group. **Parked:** edits a shared doc (`tools/agents/docs/index.md`) outside the package cell. — review.md

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit conversation, **not** placed in Recommended — each is a design fork, a boundary question, or a cross-package ruling. The charter is a stub; these seed its _Open directions_ (this assessment does not edit the charter).

1. **`getScreenNearestRect` vs `getScreenContainingRect` redundancy.** They share one body under two names in the delta (b2824e3d8:screen.ts:600-602). Keep both as intent-revealing aliases, give them distinct semantics (nearest-rect = center-distance, containing = overlap, mirroring Electron's `getDisplayNearestPoint` vs `getDisplayMatching`), or collapse to one? A deliberate API-shape ruling that should land before this surface is frozen.

2. **Late-subscribe + upgrade ordering.** `subscribe` captures `_screenDetails` at subscription time (b2824e3d8:screen.ts:331-337), so subscribing before `requestScreenDetails()` misses post-upgrade `screenschange` events. Bless "call `requestScreenDetails` before subscribing" as a usage rule, or fix `subscribe` to re-bind on `_upgrade`? A behavior decision, not a cleanup.

3. **North star / the bar.** Is the target the union of Electron `screen` + Tauri + SDL3 + browser Window Management (the bar this pass built toward), or a deliberately thinner web-first surface? Decides whether the native-only fields are obligations or aspirations.

4. **Cheap web-populatable fields (boundary question).** Populate `monochrome` (`matchMedia('(monochrome)')`), `dpi` (`96 * devicePixelRatio`), `depthPerComponent` (inferable from `colorDepth`) on web where derivable, or leave sentinel until a native host fills them?

5. **Stable-id contract.** Numeric vs string, and the guarantee a native host must honor across hot-plug — a seam decision that must precede the first conforming native backend (and the Backlog stable-id test).

6. **Cross-package boundary rulings.** Cursor-position ownership vs `@flighthq/input` / `@flighthq/interaction`; display-metrics overlap with `@flighthq/device` (`getDeviceDisplayMetrics`); whether the Window Management granted state persists via `@flighthq/storage`. Each wants a one-line Package Map ruling.
