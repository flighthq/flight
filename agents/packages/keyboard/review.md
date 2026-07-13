---
package: '@flighthq/keyboard'
status: solid
score: 80
updated: '2026-07-13'
ingested:
  - status.md
  - charter.md
  - source (packages/keyboard/src)
  - packages/types/src/Keyboard.ts, SoftKeyboardEasingKind.ts
  - packages/keyboard/README.md
---

# keyboard — Review

## Verdict

**`solid` — 80/100.** The prior review (2026-06-25, 45/partial) was a merge-gate review of an integration slice that carried the keyboard source upgrade without its `@flighthq/types` companion and therefore did not compile. **That blocker is resolved:** `packages/types/src/Keyboard.ts` now declares the full surface the source was written against — `SoftKeyboardInfo` with `x`/`y`/`width` rect fields, `SoftKeyboardPhase`, `SoftKeyboardTransition`, the phase+transition `subscribe` signature, the seven optional native-control backend methods, and the 9-signal `SoftKeyboard` — with `SoftKeyboardEasingKind.ts` alongside. Everything compiles and every claim of the earlier standalone 90-scoring read is verified in source, with the caveats below.

Judged against this package's own charter boundary (the global soft keyboard; per-field IME/input traits belong to `@flighthq/textinput`, raw key events to `@flighthq/input`), the surface is close to the industry-reference shape (Capacitor's Keyboard plugin): show/hide, visibility + height + frame rect, will/did lifecycle signals with transition metadata, and the native-control quartet (resize mode, style, accessory bar, scroll assist). The web backend is a genuine reference implementation — Chromium VirtualKeyboard API with `visualViewport` fallback — and the seam is shaped so native hosts can hit full fidelity (will-phase with real timing, rect geometry, all control methods). Held below 90: the easing tier is a dead type-only placeholder, the kind-const vocabulary is thinner than the status log claims, and no native backend has ever exercised the will-phase/control paths.

## Present capabilities (verified against source)

20 exports in `packages/keyboard/src/keyboard.ts`, 60 tests, `describe` blocks alphabetized 1:1 with exports, plus a package README (functions table, nine-signal table, capability matrix, keyboard-aware-layout recipe):

- **Entity quartet:** `createSoftKeyboard` (9 inert signals), `attachSoftKeyboard` (idempotent; will-phase dispatches `onWillShow`/`onWillHide`/`onWillResize` with the transition, did-phase dispatches `onDidResize`+`onResize` and the show/hide edge pairs with alias co-emission; visibility edge tracked across phases), `detachSoftKeyboard`, `disposeSoftKeyboard`. Subscriptions in a `WeakMap`.
- **Snapshot reads:** `getSoftKeyboardInfo(out)` (alias-safe out-param), `getSoftKeyboardHeight()` (zero-alloc via module scratch), allocators `createSoftKeyboardInfo` / `createSoftKeyboardTransition`.
- **Control:** `showSoftKeyboard` / `hideSoftKeyboard` — real operations when `navigator.virtualKeyboard` exists, documented no-ops otherwise.
- **Native-control extensions:** `get/setSoftKeyboardResizeMode`, `setSoftKeyboardStyle`, `is/setSoftKeyboardAccessoryBarVisible`, `is/setSoftKeyboardScrollAssistEnabled` — each a flat delegation to an optional backend method with a sentinel (`SoftKeyboardResizeNoneKind` / `false`) or no-op fallback. Never throws.
- **Backend seam:** `getSoftKeyboardBackend` / `setSoftKeyboardBackend` / `createWebSoftKeyboardBackend`. Web geometry prefers the VirtualKeyboard `boundingRect`, falls back to `visualViewport` shrink inference; emits `'did'` only with `durationSeconds: 0`; SSR-safe (guards on `window`/`navigator`, degrades to height 0 and no-op subscribe).

Test depth is real: multi-listener dispatch, signal priority ordering, `cancelSignal` chains, will→did ordering, rapid show/hide bursts, re-entrant detach/re-attach, both web geometry paths (VirtualKeyboard and visualViewport stubs), and the show/hide VirtualKeyboard drive.

The 2026-07-02 charter Decision (document the `transition.height` frozen-at-0 limitation) is **implemented**: `keyboard.ts` carries the durable comment stating the web backend fires `'did'` only and that native hosts emitting `'will'` must populate `transition.height`.

## Gaps (AAA-depth judgment)

1. **The easing tier is a dead placeholder.** `SoftKeyboardEasingKind` (5 kinds, closed union) exists in types but nothing references it: `SoftKeyboardTransition` has no `easing` field and the keyboard package never imports it. Either wire it (adds the field + the kind vocabulary native backends populate) or remove it — a typed symbol with zero consumers is header noise. Charter Open direction (the `@flighthq/easing`-dependency question only arises if a kind→curve lookup is wanted; the field itself needs no dependency).
2. **Kind-const vocabulary is thinner than the status log claims.** Source ships only `SoftKeyboardResizeNoneKind`/`SoftKeyboardResizeBodyKind` and `SoftKeyboardStyleDefaultKind`/`SoftKeyboardStyleDarkKind`. The claimed `SoftKeyboardResizeNativeKind`, `SoftKeyboardResizeIonicKind`, and `SoftKeyboardStyleLightKind` do **not** exist. The Capacitor-vocabulary coverage (`native`, `ionic` resize modes; `light` style) is incomplete — small, but exactly what a native backend will reach for first.
3. **No native backend proof.** The will-phase path, `transition.height`, `senderless` rect semantics for floating/split keyboards, and all seven control methods have only ever run against fakes. The seam looks right; fidelity is unproven until a `host-*` backend lands (cross-package).
4. **Types layout deviation.** `SoftKeyboardTransition`, `SoftKeyboardResizeMode`, `SoftKeyboardStyleKind`, `SoftKeyboardPhase`, `SoftKeyboardInfo`, `SoftKeyboardBackend`, and `SoftKeyboard` all live in one `Keyboard.ts` rather than one-concept-per-file (only `SoftKeyboardEasingKind` got its own file). The status log's claim of four separate type files is false in the current tree. Consistent with other platform-suite headers, but noted against the types-layout convention.
5. **No diagnostics layer.** The many silent no-ops (unsupported control methods, SSR degradation, VirtualKeyboard-absent show/hide) have no `explain*`/`enable*Guards` seams. Suite-wide pattern.

Resolved-in-source since the last review, worth recording: `SoftKeyboardResizeMode` and `SoftKeyboardStyleKind` are now **open** string types (`= string`) with const kinds — the charter's open-vs-closed question (fork B) is de facto answered *open* for those two, while `SoftKeyboardEasingKind` remains a closed union. If that split is intentional, the charter should bless it; if not, it is drift.

## Charter contradictions

None of substance. The What-it-is paragraph matches source exactly (including the 20-export shape and the input-package boundary). One nuance: Open direction 3 ("open vs closed kinds — resolve per fork B") is now half-resolved in source (gap 5 note above) without a charter Decision recording it.

## Contract & docs fit

- **Envelope:** front matter valid; `crate: flighthq-keyboard` — no Rust crate exists (cross-worktree conformance gap).
- **Self-descriptions:** `package.json` description ("visibility, height, and show/hide/resize signals") omits the frame rect, will/did phases, and the native-control quartet — mildly stale. `agents/packages/map.md` line ("on-screen keyboard visibility/height") is similarly understated. Shared-doc edits, out of sweep scope; README is current and accurate.
- **README precedent:** this package and `device` set the platform-suite README convention siblings lack.

## Candidate open directions

Carried from charter (all still live): the keyboard↔textinput boundary for per-field traits; easing wiring-or-removal (gap 1); the kind open/closed blessing (see above); safe-area/`@flighthq/device` coordination. Add: completing the Capacitor kind vocabulary (gap 2 — a types-package edit) and the first native backend realization (gap 3).
