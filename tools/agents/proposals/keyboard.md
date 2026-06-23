---
id: keyboard
title: '@flighthq/keyboard'
type: depth
target: keyboard
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/keyboard.md
  - tools/agents/docs/reviews/depth/keyboard.md
depends_on: []
updated: 2026-06-23
---

## Summary

(from depth review): solid — 80/100; a near-complete, idiomatic cell for a deliberately narrow domain (soft-keyboard visibility/height + show/hide/resize signals over a swappable web/native backend), missing only animation-aware events and a handful of native-only controls.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that makes the keyboard usable for real mobile layout work: apps must be able to animate their content in sync with the keyboard slide, which a single instantaneous `onShow`/`onHide` cannot drive. Bronze adds the will/did distinction and a duration so content animation can begin on time.

- Define in `@flighthq/types` (header first):
  - `SoftKeyboardTransition` — `Readonly` data: `{ height: number; durationSeconds: number }` (CSS-pixel height, animation duration; `0` when the host reports no timing). Plain data, not a runtime object.
  - Extend `SoftKeyboard` with will/did pairs: `onWillShow: Signal<(transition: Readonly<SoftKeyboardTransition>) => void>`, `onDidShow: Signal<(height: number) => void>`, `onWillHide: Signal<(transition: Readonly<SoftKeyboardTransition>) => void>`, `onDidHide: Signal<() => void>`. Keep existing `onShow`/`onHide`/`onResize` as the simple-path aliases (fire alongside the `did*` edge) so the basic surface is unchanged.
  - Extend `SoftKeyboardBackend.subscribe`'s callback contract so a backend can report `phase` (`'will' | 'did'`) and `durationSeconds`; default web backend reports `'did'` with `durationSeconds: 0`.
- In `@flighthq/keyboard`:
  - Update `attachSoftKeyboard` to dispatch the will/did + duration signals from the backend callback, preserving the existing visibility-edge logic for `onShow`/`onHide`.
  - `createSoftKeyboardTransition()` / `createSoftKeyboardInfo()` allocator parity (out-param convention).
- Add `enableSoftKeyboardSignals`-style opt-in is **not** needed here — the entity _is_ the signal group (event capability), so the signals are already opt-in via `attachSoftKeyboard`. Leave as-is.
- Tests: will/did edge ordering, duration pass-through, web backend reporting `'did'`/`0`, alias signals still firing.

Effort: small. One types change + one dispatch rewrite + tests. No new backend methods, no new dependencies.

### Silver

Competitive with Capacitor `Keyboard` / React Native `Keyboard`: covers the native control surface every good mobile keyboard library exposes, plus the snapshot detail mature APIs carry. All additions are backend-method extensions over the existing seam — the web default returns sentinels/no-ops.

- Types (`@flighthq/types`):
  - `SoftKeyboardResizeMode` — `*Kind` string identifiers: `SoftKeyboardResizeBodyKind = 'body'`, `SoftKeyboardResizeNativeKind = 'native'`, `SoftKeyboardResizeNoneKind = 'none'` (and `'ionic'` if a webview host wants it). String kinds, vendor-prefixable.
  - `SoftKeyboardStyleKind` — `'light' | 'dark' | 'default'` as string kinds (iOS keyboard appearance).
  - Extend `SoftKeyboardInfo` with the keyboard frame rect: add `x`, `y`, `width` (height already present), so layout code can reason about split/floating keyboards. Defaults: full-width, height-derived. Keep `visible`/`height` semantics unchanged.
  - Extend `SoftKeyboardBackend` with optional methods: `setResizeMode?(mode: SoftKeyboardResizeMode): void`, `getResizeMode?(): SoftKeyboardResizeMode`, `setStyle?(style: SoftKeyboardStyleKind): void`, `setAccessoryBarVisible?(visible: boolean): void`, `isAccessoryBarVisible?(): boolean`, `setScrollAssistEnabled?(enabled: boolean): void`. Optional so the web backend need not implement them.
- Functions (`@flighthq/keyboard`):
  - `setSoftKeyboardResizeMode(mode)` / `getSoftKeyboardResizeMode()` — delegate to backend; return sentinel (`SoftKeyboardResizeNoneKind` / no-op) when unsupported.
  - `setSoftKeyboardStyle(style)` — backend delegate, no-op on web.
  - `setSoftKeyboardAccessoryBarVisible(visible)` / `isSoftKeyboardAccessoryBarVisible()` — backend delegate; `false` sentinel on web.
  - `setSoftKeyboardScrollAssistEnabled(enabled)` — backend delegate, no-op on web.
  - `getSoftKeyboardInfo` populates the new rect fields from the backend.
- Web backend: implement `getInfo` rect fields (full window width, height from viewport shrink, y from the shrink offset); leave the native-only setters undefined (functions fall back to sentinels). Improve height inference to also use the `interactive-widget`/`overlays-content` path where `navigator.virtualKeyboard` exists (Chromium VirtualKeyboard API), still guarded.
- Optional `navigator.virtualKeyboard` integration in the web backend: when present, `showSoftKeyboard`/`hideSoftKeyboard` become real (`virtualKeyboard.show()/.hide()`) instead of no-ops, and geometry comes from `geometrychange`. This is the one place web _can_ do programmatic show/hide.
- Tests: each new setter delegates and sentinels correctly; rect population; VirtualKeyboard path mocked.

Effort: medium. Mostly additive backend methods + free-function delegates; the VirtualKeyboard web path is the only non-trivial logic. No restructure of the entity or attach flow.

### Gold

Authoritative / AAA: exhaustive timing fidelity, complete native control surface, the input-association seam, error-handling rigor, full docs, and 1:1 Rust-port parity. Nothing a domain expert misses.

- Animation fidelity:
  - `SoftKeyboardEasingKind` string kinds mirroring native curves (`'ease'`, `'easeIn'`, `'easeOut'`, `'linear'`, and the iOS keyboard curve `'keyboardDefault'`); add `easing: SoftKeyboardEasingKind` to `SoftKeyboardTransition` so content animation can match the platform curve exactly, not just the duration. Map to `@flighthq/easing` functions via a small lookup so apps can drive tweens with the real curve.
  - `onWillResize`/`onDidResize` for hosts that animate height changes between layouts (e.g. autocorrect bar toggling).
- Native control completeness (backend methods + free functions, all web-sentinel):
  - `setSoftKeyboardType(kind)` association hint where a host supports per-field keyboard types (`'default' | 'number' | 'email' | 'url' | 'phone' | 'decimal' | 'search'`) — this is the seam to `@flighthq/textinput`; surface it but keep the _implementation_ of focusing a field in textinput, not here.
  - `setSoftKeyboardReturnKey(kind)` (`'done' | 'go' | 'next' | 'search' | 'send'`), `setSoftKeyboardAutoCapitalize`, `setSoftKeyboardAutoCorrect`, `setSoftKeyboardSpellCheck` — the field-attribute controls mature keyboards expose. Decide (see Sequencing) whether these belong here or in `@flighthq/textinput`; if they associate with a focused field they likely move to textinput with this package owning only the _global_ keyboard.
  - `setSoftKeyboardSafeAreaInsetsEnabled` and exposure of the keyboard-occluded safe-area inset for layout, coordinated with `@flighthq/device` safe-area insets.
- Robustness & ergonomics:
  - `getSoftKeyboardHeight()` convenience reader (no alloc) for the common single-value read.
  - Idempotency/teardown audit: `attachSoftKeyboard` re-entrancy during emit, double-`detach`, dispose-after-detach — all covered by tests.
  - Multi-listener stress: confirm signal priority/cancellation semantics across `onWill*`/`onDid*` ordering are documented and tested.
- Tests & docs: full edge-case suite (no `window`, no `visualViewport`, no `virtualKeyboard`, rapid show/hide bursts, alias-vs-will/did ordering, every setter sentinel path); a package-level usage doc showing the "animate content with the keyboard" recipe and the resize-mode matrix.
- Rust parity (`crates/flighthq-keyboard`, already exists):
  - 1:1 port: `SoftKeyboard` signals, `SoftKeyboardInfo`, `SoftKeyboardBackend` trait, `set_soft_keyboard_backend`, all `*_soft_keyboard_*` free functions, the `*Kind` string identifiers as Rust newtypes/consts.
  - Native default backend behind a `native` cargo feature; `host-winit`/`host-sdl` report keyboard events (mobile-relevant; desktop hosts return hidden/0 sentinels). `host-web` fills the visualViewport/VirtualKeyboard path.
  - Conformance: assertion-ported unit tests (edge logic, will/did ordering, sentinels) recorded in the conformance map; transition/easing values must match TS exactly.

Effort: large only because of breadth (Rust port + the textinput boundary decision + full easing/curve mapping). Each individual item is small; the cost is coordination and the design call below.

## Sequencing & effort

Recommended order:

1. **Bronze first (small, self-contained).** Will/did + `SoftKeyboardTransition` + duration. This is the single highest-value gap (every mature mobile keyboard API has it) and touches only `@flighthq/types` + this package. Ship it before anything else.
2. **Silver native control surface (medium).** Add the optional backend methods (`setResizeMode`/`setStyle`/accessory-bar/scroll-assist) and their free-function delegates, plus the `SoftKeyboardInfo` rect fields. These are purely additive and unblock native hosts. Do the `navigator.virtualKeyboard` web path here since it is the only real web show/hide.
3. **Gold last**, after Silver settles the backend shape: easing curves, the field-attribute controls (pending the boundary decision), robustness/test sweep, then the Rust port mirror.

Dependencies on other packages / types:

- **`@flighthq/types` is the gate for every tier** — add `SoftKeyboardTransition`, the resize/style/easing `*Kind` strings, the extended `SoftKeyboardInfo`, and the optional `SoftKeyboardBackend` methods to the header layer _before_ implementing. Run `npm run packages:check` and `npm run api keyboard` after.
- **`@flighthq/easing`** — Gold's curve mapping should reuse easing functions, not redefine them; only a thin kind→function lookup belongs here.
- **`@flighthq/device`** — safe-area inset coordination (avoid duplicating insets; reference device's).
- **Host backends** (`host-electron` today; future `host-capacitor` for mobile) implement the native methods. The native control surface is mostly mobile, so its real exercise waits on a mobile host.

Cross-package / design-decision items to surface to the user:

- **Field-attribute controls (return-key type, autocapitalize, autocorrect, keyboard type) — boundary decision.** These associate with a _focused text field_, which is `@flighthq/textinput`'s domain, not the _global_ soft keyboard. Recommend: this package owns only the global keyboard (visibility/height/style/resize-mode/accessory-bar); per-field input traits live in `textinput` and merely _influence_ the keyboard. Confirm this split before building the Gold field-attribute setters here, to avoid duplicating the seam.
- **`navigator.virtualKeyboard` making web show/hide real** changes the documented "no-op on web" truth for capable browsers. Worth a one-line confirmation that turning the web no-op into a real call (when the API exists) is desired rather than keeping web uniformly inert.
- **Keeping `onShow`/`onHide`/`onResize` as aliases vs. replacing them** with will/did only. Recommend keeping the simple aliases (pre-release allows the rename, but the simple path is genuinely useful and cheap to keep). Flag if the user prefers a clean replacement instead.

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

> Build `@flighthq/keyboard` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
