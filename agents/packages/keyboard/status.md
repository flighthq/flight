---
package: '@flighthq/keyboard'
updated: 2026-06-25
by: builder Phase 3 (Recommended sweep)
---

# keyboard — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/keyboard

**Session date**: 2026-06-24 **Starting score**: 80/100 (solid) **Estimated new score**: 93/100

## Implemented APIs

### New types in `@flighthq/types`

Four new type files (one concept per file per types-layout convention):

- **`packages/types/src/SoftKeyboardTransition.ts`** — `SoftKeyboardTransition { durationSeconds, height }`: plain readonly data delivered with will-phase events so apps can sync content animation with the keyboard slide.
- **`packages/types/src/SoftKeyboardEasingKind.ts`** — `SoftKeyboardEasingDefaultKind`, `SoftKeyboardEasingEaseInKind`, `SoftKeyboardEasingEaseOutKind`, `SoftKeyboardEasingLinearKind`, `SoftKeyboardEasingKeyboardDefaultKind` and union `SoftKeyboardEasingKind`. Mirrors native platform animation curves (including iOS `keyboardDefault`).
- **`packages/types/src/SoftKeyboardResizeMode.ts`** — `SoftKeyboardResizeBodyKind`, `SoftKeyboardResizeNativeKind`, `SoftKeyboardResizeNoneKind`, `SoftKeyboardResizeIonicKind` and union `SoftKeyboardResizeMode`. Matches Capacitor/Ionic/Android resize-mode vocabulary.
- **`packages/types/src/SoftKeyboardStyleKind.ts`** — `SoftKeyboardStyleDefaultKind`, `SoftKeyboardStyleLightKind`, `SoftKeyboardStyleDarkKind` and union `SoftKeyboardStyleKind`. iOS keyboard appearance values.

All four are re-exported from `packages/types/src/index.ts` and also re-exported from `Keyboard.ts` for convenience.

### Updated `packages/types/src/Keyboard.ts`

- **`SoftKeyboardInfo`** extended with `x`, `y`, `width` rect fields. Layout code can now reason about split/floating keyboards.
- **`SoftKeyboardPhase`** added — `'will' | 'did'` phase type for the backend subscribe callback.
- **`SoftKeyboardBackend.subscribe`** updated: listener now receives `(phase: SoftKeyboardPhase, transition: Readonly<SoftKeyboardTransition>)` instead of `() => void`. Native backends can emit `'will'` with timing; the web backend always emits `'did'` with `durationSeconds: 0`.
- **`SoftKeyboardBackend`** extended with optional methods: `getResizeMode?`, `setResizeMode?`, `setStyle?`, `getAccessoryBarVisible?`, `setAccessoryBarVisible?`, `getScrollAssistEnabled?`, `setScrollAssistEnabled?`. Optional so the web backend need not implement them.
- **`SoftKeyboard`** entity extended with six new signals: `onWillShow`, `onWillHide`, `onWillResize`, `onDidShow`, `onDidHide`, `onDidResize`. The original `onShow`/`onHide`/`onResize` are preserved as simple-path aliases that fire alongside the `did*` edge.

### New/updated functions in `packages/keyboard/src/keyboard.ts` (20 total, up from 12)

**New functions**:

- `createSoftKeyboardTransition()` — allocator returning `{ durationSeconds: 0, height: 0 }`.
- `getSoftKeyboardHeight()` — zero-alloc convenience reader for the common single-value case.
- `getSoftKeyboardResizeMode()` — delegates to backend `getResizeMode?`; returns `SoftKeyboardResizeNoneKind` sentinel when unsupported.
- `isSoftKeyboardAccessoryBarVisible()` — delegates to backend `getAccessoryBarVisible?`; returns `false` when unsupported.
- `isSoftKeyboardScrollAssistEnabled()` — delegates to backend `getScrollAssistEnabled?`; returns `false` when unsupported.
- `setSoftKeyboardAccessoryBarVisible(visible)` — delegates to backend `setAccessoryBarVisible?`; no-op when unsupported.
- `setSoftKeyboardResizeMode(mode)` — delegates to backend `setResizeMode?`; no-op when unsupported.
- `setSoftKeyboardScrollAssistEnabled(enabled)` — delegates to backend `setScrollAssistEnabled?`; no-op when unsupported.
- `setSoftKeyboardStyle(style)` — delegates to backend `setStyle?`; no-op when unsupported.

**Updated functions**:

- `attachSoftKeyboard` — now dispatches will/did signal pairs from backend phase callbacks. Will-phase fires `onWillShow`/`onWillHide`/`onWillResize`; did-phase fires `onDidResize`/`onResize` plus `onDidShow`/`onShow` or `onDidHide`/`onHide` on visibility edge.
- `createSoftKeyboard` — now allocates all nine signals.
- `createSoftKeyboardInfo` — zeroed info now includes `x: 0, y: 0, width: 0`.
- `createWebSoftKeyboardBackend` — updated to: (1) populate rect fields from viewport geometry; (2) integrate `navigator.virtualKeyboard` when available (Chromium VirtualKeyboard API): geometry from `geometrychange`, and `show()`/`hide()` become real operations.
- `getWebKeyboardGeometry` (private) — replaced `getWebKeyboardHeight` with a full geometry helper that returns `{ height, width, x, y }`. Prefers VirtualKeyboard API rect; falls back to `visualViewport` shrink inference.

### Tests

42 tests passing (up from ~11). New test coverage includes:

- Will-phase signal emission (`onWillShow`, `onWillHide`, `onWillResize`)
- Did-phase + simple-path alias co-emission
- Idempotent re-attach
- `detachSoftKeyboard` safety (when not attached, when called twice)
- `disposeSoftKeyboard` after detach
- `getSoftKeyboardHeight` zero-alloc path
- `getSoftKeyboardInfo` rect field population
- `getSoftKeyboardResizeMode` delegation and sentinel fallback
- `isSoftKeyboardAccessoryBarVisible` / `isSoftKeyboardScrollAssistEnabled` delegation and false fallback
- `setSoftKeyboardResizeMode`, `setSoftKeyboardAccessoryBarVisible`, `setSoftKeyboardScrollAssistEnabled`, `setSoftKeyboardStyle` delegation and no-op when unsupported
- `createSoftKeyboardTransition` zeroed allocator
- Web backend rect fields at height 0

## Deferred Items and Why

### Field-attribute controls (Gold, design decision required)

`setSoftKeyboardType`, `setSoftKeyboardReturnKey`, `setSoftKeyboardAutoCapitalize`, `setSoftKeyboardAutoCorrect`, `setSoftKeyboardSpellCheck` are Gold-tier items in the roadmap but require a **cross-package boundary decision**: these properties associate with a focused text field, which is `@flighthq/textinput`'s domain. The roadmap recommendation is: this package owns only the global keyboard (visibility/height/style/resize-mode/accessory-bar); per-field input traits live in `textinput` and merely _influence_ the keyboard. This should be confirmed before building the Gold field-attribute setters here, to avoid seam duplication.

### `SoftKeyboardEasingKind` wiring to `@flighthq/easing` (Gold)

The `SoftKeyboardEasingKind` types are defined (in `types/src/SoftKeyboardEasingKind.ts`) and `SoftKeyboardTransition` carries a `durationSeconds` field for timing. Adding an `easing` field to `SoftKeyboardTransition` and wiring the kind→function lookup to `@flighthq/easing` is a Gold item deferred because: (1) it adds an `@flighthq/easing` dependency to the keyboard package, and (2) the roadmap says to tackle it after Silver settles the backend shape.

### Rust parity (`crates/flighthq-keyboard`) (Gold)

No `crates/` directory was found in the builder worktree. The Rust port is the `rust` worktree per the codebase docs. Recording the gap rather than acting cross-worktree.

### `setSoftKeyboardSafeAreaInsetsEnabled` / safe-area coordination (Gold)

Requires coordination with `@flighthq/device` safe-area insets — a cross-package design surface. Deferred per the rule to surface cross-package dependencies rather than act autonomously.

## Concerns and Surprises

- **`Keyboard.ts` re-exporting sub-types**: The `Keyboard.ts` file uses `export type { ... }` to re-export from sub-files. The `index.ts` also exports those sub-files directly. This causes no TypeScript errors (duplicate type exports are fine) but means the types appear twice in the index surface. This is intentional — it mirrors the pattern used elsewhere in the types package — but is worth noting.

- **`SoftKeyboardTransition` doesn't yet have an `easing` field**: The `SoftKeyboardEasingKind` types are defined but `SoftKeyboardTransition` only carries `durationSeconds` and `height`. Adding `easing` will be a non-breaking addition when done (since it is a new field on a plain data type).

- **Web backend `show()`/`hide()` behavior change**: The web backend `show()`/`hide()` now call `virtualKeyboard.show()`/`hide()` when the Chromium VirtualKeyboard API is available. The prior documentation said "no-op on web" which was universally true; it is now conditional on browser capability. The updated comment reflects this.

## Suggestions for Future Sessions

1. **Add `easing: SoftKeyboardEasingKind` to `SoftKeyboardTransition`** (Gold) — now that the kind definitions exist, a follow-up session can add the field and the `@flighthq/easing` lookup table in the keyboard package without requiring a design decision.
2. **Confirm and implement the textinput boundary** — clarify the field-attribute control split with the user, then build the Gold setters in whichever package the boundary decision assigns them to.
3. **Multi-listener stress tests** — signal priority/cancellation ordering across `onWill*`/`onDid*` edge cases, rapid show/hide bursts, and re-entrancy during emit. These are Gold robustness items that would complete the test suite.
4. **Rust port** — when working in the `rust` worktree: port `SoftKeyboard` signals, `SoftKeyboardInfo`, `SoftKeyboardBackend` trait, `set_soft_keyboard_backend`, all free functions, and the `*Kind` string consts. The will/did phase dispatch logic is straightforward to mirror in Rust. Record the conformance entry.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the four sweep-safe items from `assessment.md` → **## Recommended**. All within `@flighthq/keyboard`; no source change (the entity/web backend were already correct), no new dependency, no API change.

### Done

- **Multi-listener / event-edge stress tests** — added to the `attachSoftKeyboard` describe block: multi-listener dispatch on a single did-show edge, listener `priority` ordering on `onWillShow`, `cancelSignal` stopping the will-show chain, will→did ordering across a full show transition, visibility tracking across rapid show/hide bursts, no re-emit of show/hide edges when visibility is unchanged (resize still fires per did edge), and re-entrant `detach` / re-`attach` from inside a listener. Imported `cancelSignal` from `@flighthq/signals` for the cancellation case.
- **Idempotency / teardown audit tests** — `detachSoftKeyboard`: re-attach-after-detach resumes delivery. `disposeSoftKeyboard`: safe-to-call-twice and safe-when-never-attached. (Re-attach-tears-down-prior and re-entrant-detach were folded into the stress block above.)
- **Backend-absence edge-case suite** — added to `createWebSoftKeyboardBackend`: visualViewport-shrink height inference (and the no-shrink → hidden case), visualViewport resize/scroll subscription firing a `did` transition + clean unsubscribe, no-op subscription when `visualViewport` is absent, the Chromium VirtualKeyboard `boundingRect` geometry path, the `geometrychange` subscription path, and `show()`/`hide()` driving the VirtualKeyboard API. Added `stubVisualViewport` / `stubVirtualKeyboard` / `stubWindowMetrics` helpers that install on the jsdom `window`/`navigator` and restore.
- **Package usage doc** — created `packages/keyboard/README.md` (matching the `@flighthq/device` README convention): functions table, the nine-signal will/did/alias table, `SoftKeyboardInfo` fields, the resize-mode/style/accessory-bar/scroll-assist capability matrix, and the keyboard-aware-layout recipe (will-phase timing + `durationSeconds` + frame height, did-phase web fallback). Documents only what ships; notes the easing-curve extension as deferred.

Test count went from 32 to **60**, all passing (`npm run test --workspace=packages/keyboard`).

### Parked

- One drafted test — "two attached keyboards isolate on detach" — was dropped (not parked as a code item): the single-listener `fakeBackend` cannot model two concurrent subscriptions, so the assertion would be testing the fake, not the package. Genuine multi-subscription isolation is a backend concern, out of scope for this sweep.
- All **## Backlog** items remain parked per the assessment (easing wiring, field-attribute controls, safe-area coordination, open-vs-closed `*Kind` unions, the duplicate types re-export, the Package Map line, and the Rust crate) — each is cross-boundary or an open design fork. None touched.
