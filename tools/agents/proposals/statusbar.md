---
id: statusbar
title: '@flighthq/statusbar'
type: depth
target: statusbar
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/statusbar.md
  - tools/agents/docs/reviews/depth/statusbar.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100. The command (write) surface is clean and canonical; the package is missing the query (read) half, the height/safe-area dimension, animation, and change notification.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely-useful version closes the single biggest omission: the package is write-only today. Add the read side and a height accessor so a consumer can lay content out around the bar.

Types first, in `@flighthq/types` (`StatusBar.ts`):

- `StatusBarInfo` interface — `{ visible: boolean; style: StatusBarStyle; color: number; overlaysContent: boolean; height: number }`. `color` is packed `0xRRGGBBAA`; `height` in CSS pixels, `-1` when the host does not report it.
- Extend `StatusBarBackend` with one read method: `getInfo(out: StatusBarInfo): StatusBarInfo` (single `out`-param read, not four getters — keeps the trait tight, matches the depth review's recommendation and the `NetworkBackend.getStatus(out)` precedent).

`@flighthq/statusbar` (`statusbar.ts`):

- `createStatusBarInfo(): StatusBarInfo` — explicit allocation of a default-valued info struct for use as an `out` target.
- `getStatusBarInfo(out: StatusBarInfo): StatusBarInfo` — delegates to `backend.getInfo(out)`. Alias-safe; returns `out`.
- `getStatusBarHeight(): number` — convenience over a scratch `getInfo`; returns `-1` when unknown (sentinel, per rules).
- `createWebStatusBarBackend().getInfo` — web fill: reports the values the web backend can actually know (`color` from the current `<meta name="theme-color">` if present, else `0`; `height` = `-1`; `visible`/`overlaysContent` defaults), no-op for the rest. Web guards return sentinels, never throw.

Effort: small. One type addition, one backend method, three thin functions plus their colocated tests (including the aliased `out`-is-input case for `getStatusBarInfo`). No cross-package work.

### Silver

Competitive with Capacitor/RN: add animation, change notification, and resolve the height/safe-area ownership question explicitly.

Types (`@flighthq/types`):

- `StatusBarAnimation` open union — `'none' | 'fade' | 'slide'` (matches Capacitor `hide({ animation })` and RN `setHidden(_, animation)`).
- Change `StatusBarBackend.setVisible` to `setVisible(visible: boolean, animation: StatusBarAnimation): void` (pre-release, no compat obligation — change the seam rather than overload).
- Add the event-capability half so OS-driven changes (rotation, system-initiated hide) can be observed: `StatusBarBackend.subscribe(listener: () => void): () => void`, mirroring `NetworkBackend.subscribe`.
- `StatusBar` event entity interface — `{ onChange: Signal<(info: Readonly<StatusBarInfo>) => void> }` (signal payload carries the new snapshot, matching `Network.onChange`).

`@flighthq/statusbar`:

- `setStatusBarVisible(visible, animation)` — thread the animation parameter through (default `'none'` documented; explicit at the seam).
- `enableStatusBarSignals()` / event-entity wiring following the platform-suite event-capability shape: `createStatusBar(): StatusBar`, `attachStatusBar(bar)`, `detachStatusBar(bar)`, `disposeStatusBar(bar)` (detach + clear listeners → GC; `dispose*`, not `destroy*`, since there is no non-GC resource). Signals come from `@flighthq/signals` and stay inert until `attach*`.
- Web backend: implement `subscribe` over the relevant web signals where any exist — wire it to `visualViewport` resize / `matchMedia('(prefers-color-scheme)')` so the web fill emits real change events for `height`/`style` rather than a permanent no-op; otherwise return a no-op unsubscribe.

Cross-package design decision to settle here (surface to the user, do not decide autonomously):

- **Status-bar height vs. `@flighthq/device` safe-area top inset.** `Device.SafeAreaInsets` already exists and `@flighthq/device` is documented as owning safe-area insets. Decide whether `getStatusBarHeight()` is the authoritative source, a convenience that reads `device.getSafeAreaInsets().top`, or whether height is a distinct concept (status-bar height ≠ top inset on notched devices). Document the resolution in `StatusBar.ts` regardless of outcome. If delegated, keep `getStatusBarHeight()` as a documented convenience that forwards, so the standalone-library gap is still closed.

Effort: medium. The event-capability half is the bulk; it is a well-trodden pattern in the suite (copy `network`), so risk is low. The seam signature change to `setVisible` ripples to any registered backends.

### Gold

Authoritative for the domain, with full backend-seam symmetry, edge-case handling, and 1:1 Rust parity. Nothing a domain expert (coming from Capacitor or RN) would find missing.

`@flighthq/statusbar`:

- **Style stacking** (RN `pushStackEntry`/`popStackEntry`): `pushStatusBarStyleEntry(entry: Readonly<StatusBarStyleEntry>): StatusBarStyleEntryHandle` and `popStatusBarStyleEntry(handle: StatusBarStyleEntryHandle): void`, where `StatusBarStyleEntry` (defined in `@flighthq/types`) is `{ style?: StatusBarStyle; visible?: boolean; color?: number; animation?: StatusBarAnimation }`. The package owns the stack (loose module state at file bottom), computes the merged top entry, and applies it through the backend — so nested components layer style and restore on unmount without a global last-write-wins clash. Handle is an opaque numeric id; `popStatusBarStyleEntry` of an unknown handle is a no-op (sentinel behavior, not a throw).
- **Animated background color**: `setStatusBarColor(color, animated?: boolean)` — RN's `animated` flag; default `false`. Thread `animated` into `StatusBarBackend.setBackgroundColor(color, animated)`.
- **Style semantics completeness**: confirm `'light' | 'dark' | 'default'` is the deliberate canonical set and document that it maps to iOS `lightContent`/`darkContent` by intent (the depth review notes the three values cover iOS semantics) — i.e. a one-line type-doc decision, not new values, unless the user wants explicit `'lightContent'`/`'darkContent'`.
- **Idempotence / edge-case hardening + docs**: theme-color meta upsert already idempotent (tested); extend tests to cover `getInfo` reading back a host-set color, the stack merge order, no-document/SSR guards on every web path, and `-1` height sentinel propagation. Add the package-level doc comment block describing the seam, the height-ownership decision, and the stacking contract.

`@flighthq/types`:

- `StatusBarStyleEntry`, `StatusBarStyleEntryHandle` (opaque number newtype/brand), and the `animated` parameter additions to `setBackgroundColor`. The header should fully describe the stacking and animation contract.

Rust port (`flighthq-statusbar` crate) — 1:1 conformance:

- `StatusBarBackend` trait (`set_style`, `set_visible(visible, animation)`, `set_background_color(color, animated)`, `set_overlays_content`, `get_info(out: &mut StatusBarInfo)`, `subscribe`) in `flighthq-types`; `set_status_bar_*` / `get_status_bar_info` / `get_status_bar_height` / `push_status_bar_style_entry` / `pop_status_bar_style_entry` free functions; native default backend gated behind the `native` feature (no-op/sentinel where the OS has no status bar, e.g. desktop), web backend in `host-web` filling the theme-color + viewport paths. Record any intentional TS↔Rust divergence in the conformance map. Pair the event-capability wiring with the Rust `Signal<T>` shape.

Genuinely out of scope (correctly absent, document as such): iOS network-activity indicator (Apple-deprecated), per-platform divergence shims, and any "-formats" neighbor package (this domain has no parser/importer surface, so the `-formats` pattern does not apply).

## Sequencing & effort

1. **Bronze (small, do first, no dependencies).** `StatusBarInfo` + `getInfo(out)` on the backend, `createStatusBarInfo`, `getStatusBarInfo`, `getStatusBarHeight`, web `getInfo` fill, tests. Self-contained in `types` + `statusbar`.
2. **Silver — animation (small).** Add `StatusBarAnimation`, change `setVisible` signature, thread the param. Do before the event half so the seam settles once.
3. **Silver — event capability (medium).** Copy the `@flighthq/network` event-entity shape (`createStatusBar`/`attach`/`detach`/`dispose`, `onChange` signal, `subscribe` on the backend). Depends on `@flighthq/signals` (already a suite dependency). Wire the web `subscribe` to `visualViewport`/`matchMedia`.
4. **Silver — height ownership decision (design item, surface to user before coding step 1's `getStatusBarHeight`).** Resolve status-bar height vs. `@flighthq/device` `SafeAreaInsets.top`. This is the one cross-package coupling and a real design decision — raise it rather than deciding autonomously. Bronze can ship `getStatusBarHeight()` returning the backend value with the doc note deferred, but the final wording depends on this.
5. **Gold — style stacking (medium).** Package-owned stack + merge; new `StatusBarStyleEntry`/handle types. Independent of the event work; can follow it.
6. **Gold — animated color, semantics doc, edge-case tests, package docs (small).**
7. **Gold — Rust `flighthq-statusbar` crate (medium).** Mirrors the finished TS seam 1:1; do last so the TS seam is stable. Update the conformance map.

Cross-package / design items to surface explicitly:

- **Height vs. device safe-area top inset** (step 4) — ownership and whether height forwards to `@flighthq/device` or is a distinct concept on notched hardware.
- **`setVisible` seam signature change** (step 2) — touches every registered backend; pre-release so acceptable, but note it in any host backend that implements the trait.
- The `getInfo(out)` single-read vs. discrete getters choice is already settled by the depth review (single `out`-param read) and the `NetworkBackend` precedent — no decision needed, just follow it.

Run `npm run check`, `npm run exports:check`, and `npm run order` after each tier; `npm run api statusbar` to confirm naming symmetry.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/statusbar` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
