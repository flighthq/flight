---
package: '@flighthq/keyboard'
status: solid
score: 72
updated: '2026-09-02'
ingested:
  - status.md
  - charter.md
  - source (packages/keyboard/src)
  - packages/types/src/Keyboard.ts
  - packages/types/src/Host.ts (HasSoftKeyboard* witnesses)
  - agents/packages/platform-integration.md
---

# keyboard — Review

## Verdict

**`solid` — 72/100.** The 2026-08-30 v3 rewrite replaced the entire surface: the will/did signal pairs, `SoftKeyboardTransition`, `SoftKeyboardEasingKind`, and the ambient `get/setSoftKeyboardBackend` pattern are all deleted. In their place is a clean direct-dispatch architecture where every operation takes a `Has*` host witness and dispatches through `host.input.slot.operation()`. The result is a smaller, more coherent package (13 exports, 22 tests, 3 signals) that implements the explicit dependency model faithfully. Held below 80: eager signal allocation violates the shared platform-integration `enable*Signals` principle, a visibility-semantics gap between `attachSoftKeyboard` and `isSoftKeyboardVisible`, thin kind-constant vocabulary, and missing diagnostics.

The prior review (2026-07-13, solid/80) is **fully stale** — it describes a 20-export, 60-test, 9-signal surface with `getSoftKeyboardBackend`/`setSoftKeyboardBackend`/`createWebSoftKeyboardBackend` and will/did phases. None of that exists anymore.

## Present capabilities (verified against source)

Source is a single file: `packages/keyboard/src/keyboard.ts` (119 lines). 13 exports via `index.ts` re-exporting from `contract.ts`. All 22 tests pass.

### Entity lifecycle quartet

- **`createSoftKeyboard()`** — allocates an `Entity` with three signals: `onShow`, `onHide`, `onResize`. Uses `createEntity` from `@flighthq/entity/contract` and `createSignal` from `@flighthq/signals/contract`.
- **`attachSoftKeyboard(host, keyboard)`** — takes `HasSoftKeyboardChange & HasSoftKeyboardInfo`. Calls `detachSoftKeyboard` first (idempotent re-attach). Subscribes to the change backend; on each change notification, reads the info backend into a module-level scratch object and computes visibility edges from height transitions. Fires `onShow(height)` on 0-to-positive, `onHide()` on positive-to-0, `onResize(height)` on positive-to-different-positive. Returns `SoftKeyboardAttachResult` (`'ok'` | `'acquisition-failed'`). Subscription stored in a `WeakMap`.
- **`detachSoftKeyboard(keyboard)`** — calls the stored unsubscribe function if present. Safe on never-attached keyboards.
- **`disposeSoftKeyboard(keyboard)`** — delegates to `detachSoftKeyboard`. No signal teardown.

### Snapshot reads

- **`getSoftKeyboardInfo(host, out)`** — out-parameter delegation to `host.input.softKeyboardInfo.getInfo(out)`. Returns the `out` object.
- **`getSoftKeyboardHeight(host)`** — zero-alloc convenience; reads via module-level `_scratch` and returns `.height`.
- **`isSoftKeyboardVisible(host)`** — reads via `_scratch` and returns `.visible`.

### Visibility control

- **`showSoftKeyboard(host)`** — takes `HasSoftKeyboardVisibility`, delegates to `host.input.softKeyboardVisibility.show()`. Returns `SoftKeyboardVisibilityResult`.
- **`hideSoftKeyboard(host)`** — same pattern, `.hide()`.

### Native-control extensions

- **`setSoftKeyboardAccessoryBarVisible(host, visible)`** — takes `HasSoftKeyboardAccessoryBar`.
- **`setSoftKeyboardResizeMode(host, mode)`** — takes `HasSoftKeyboardResizeModeWrite`.
- **`setSoftKeyboardScrollAssistEnabled(host, enabled)`** — takes `HasSoftKeyboardScrollAssist`.
- **`setSoftKeyboardStyle(host, style)`** — takes `HasSoftKeyboardStyle`.

All four return `Promise<SoftKeyboardSetterResult>` (`'ok'` | `'operation-unavailable'` | `'operation-failed'`).

### Types surface (`@flighthq/types`)

Types in `Keyboard.ts`: `SoftKeyboardInfo` (5 fields: visible, height, x, y, width), `SoftKeyboard` (3 signal fields), `SoftKeyboardResizeMode` (open `string` alias, 2 constants: `None`, `Body`), `SoftKeyboardStyleKind` (open `string` alias, 2 constants: `Default`, `Dark`), three result unions with const companions, `SoftKeyboardChangeSubscription`, and seven backend entity interfaces (`SoftKeyboardInfoBackend`, `SoftKeyboardChangeBackend`, `SoftKeyboardVisibilityBackend`, `SoftKeyboardResizeModeWriteBackend`, `SoftKeyboardStyleBackend`, `SoftKeyboardAccessoryBarBackend`, `SoftKeyboardScrollAssistBackend`).

Seven `Has*` witness types in `Host.ts` (lines 699-733): one per backend interface, each nesting the backend under `readonly input`.

### Host backend coverage

- **`host-web`** (`webKeyboard.ts`) provides `createWebSoftKeyboardInfoBackend`, `createWebSoftKeyboardChangeBackend`, `createWebSoftKeyboardVisibilityBackend` — three of seven capabilities. Integrated via `webInputHost.ts`.
- **`host-capacitor`** (`capacitorKeyboard.ts`) provides all seven factory functions. Both tested independently; neither depends on `@flighthq/keyboard`.

### Test coverage

22 tests in `keyboard.test.ts`. `describe` blocks alphabetized and mirror all 13 export names. Coverage profile:

- `attachSoftKeyboard`: 5 tests — ok result, acquisition-failed, onShow/onHide/onResize signal dispatch via inline fake backends with captured listeners.
- `createSoftKeyboard`: 1 test — entity identity and signal presence.
- `detachSoftKeyboard`: 1 test — safe on never-attached.
- `disposeSoftKeyboard`: 1 test — safe on never-attached.
- `getSoftKeyboardHeight`: 2 tests — positive height, zero.
- `getSoftKeyboardInfo`: 1 test — out-parameter identity and field values.
- `hideSoftKeyboard`: 2 tests — ok and operation-failed.
- `isSoftKeyboardVisible`: 2 tests — true and false.
- `setSoftKeyboardAccessoryBarVisible`: 2 tests — ok and operation-failed.
- `setSoftKeyboardResizeMode`: 1 test — ok only.
- `setSoftKeyboardScrollAssistEnabled`: 1 test — ok only.
- `setSoftKeyboardStyle`: 1 test — ok only.
- `showSoftKeyboard`: 2 tests — ok and operation-failed.

## Gaps

1. **Eager signal allocation violates the platform-integration shared principle.** The shared charter decision ([2026-07-02]) states: "Use `enable*Signals` gates — do not eagerly allocate signals in `create*` functions." `createSoftKeyboard()` at `keyboard.ts:51-55` allocates all three signals unconditionally. The `power` package demonstrates the correct pattern: `createPower` leaves signals null, `enablePowerSignals` allocates them on demand. No `enableSoftKeyboardSignals` function exists. Already recorded in `status.md` Open section.

2. **Visibility-semantics gap between `attachSoftKeyboard` and `isSoftKeyboardVisible`.** `attachSoftKeyboard` derives visibility from `height > 0` (lines 32-33: `const wasVisible = prevHeight > 0; const nowVisible = nowHeight > 0;`), ignoring the `visible` field entirely. `isSoftKeyboardVisible` reads `info.visible` from the backend (line 83). A backend that reports `visible: true` with `height: 0` (a plausible state during keyboard animation) would be visible according to `isSoftKeyboardVisible` but invisible to `attachSoftKeyboard`'s signal logic. Either both should use the same authority, or the divergence should be documented as intentional.

3. **Kind-constant vocabulary is thin.** `SoftKeyboardResizeMode` has only `None` and `Body`; missing at minimum `Native` and `Ionic` (Capacitor's four values). `SoftKeyboardStyleKind` has only `Default` and `Dark`; missing `Light`. The types are open (`= string`) so this does not block native backends, but the missing constants mean no type-safe names for common native configurations.

4. **Setter delegate tests cover only the success path.** `setSoftKeyboardResizeMode`, `setSoftKeyboardScrollAssistEnabled`, and `setSoftKeyboardStyle` each have a single test for the `'ok'` result. The `'operation-failed'` and `'operation-unavailable'` paths are untested. Compare `hideSoftKeyboard` and `setSoftKeyboardAccessoryBarVisible`, which test both ok and operation-failed.

5. **`disposeSoftKeyboard` does not tear down signals.** It delegates to `detachSoftKeyboard` (unsubscribes from the host) but does not disconnect signal listeners from `onShow`/`onHide`/`onResize`. A disposed keyboard's signals remain live and reachable. Whether this is correct depends on whether the caller is expected to discard the keyboard reference (GC handles it via `WeakMap`) or whether `dispose*` should sever signal connections. The codebase convention says `dispose*` releases what keeps an entity reachable; signals with connected listeners are exactly that.

6. **No diagnostics layer.** No `enableSoftKeyboardGuards`, no `explainSoftKeyboardAttachResult`, no `explainSoftKeyboardSetterResult`. Silent sentinel returns from every setter and the visibility control have no shakeable explanation companion. Suite-wide gap, not keyboard-specific.

7. **Per-field keyboard attributes remain unbuilt and unowned.** `setSoftKeyboardType`, `setSoftKeyboardReturnKey`, `setSoftKeyboardAutoCapitalize`, `setSoftKeyboardAutoCorrect`, `setSoftKeyboardSpellCheck` — none exist. The keyboard/textinput boundary is an open direction. Cross-package.

8. **No safe-area coordination.** Combining `getSoftKeyboardHeight` with `@flighthq/device`'s safe-area insets is left entirely to the caller. Cross-package design surface.

## Charter contradictions

1. **Shared principle violation (eager signals).** The platform-integration shared charter ([2026-07-02]) explicitly requires `enable*Signals` gates. `createSoftKeyboard` eagerly allocates all three signals. This is the only direct contradiction against the charter or its shared principles.

2. **Open direction partially resolved without a Decision.** Charter Open direction 2 asks whether `SoftKeyboardResizeMode` and `SoftKeyboardStyleKind` should be open or closed kinds. Source resolves this as open (`= string` aliases with const companions). No `Decisions` entry records this choice. The resolved-in-source state is coherent; it needs a charter entry to be blessed.

No other contradictions. The What-it-is paragraph, the v3 Decision, and the package boundary (not physical keys, not per-field IME) all match source exactly.

## Contract & docs fit

- **Two blessed lanes:** `.` (`index.ts`) and `./contract` (`contract.ts`) — correct. `index.ts` re-exports from `contract.ts`; `contract.ts` re-exports from `keyboard.ts`. No banned subpaths.
- **`sideEffects: false`:** declared in `package.json` — correct. No top-level registration.
- **Types in `@flighthq/types`:** all interfaces and type aliases live in `Keyboard.ts` and `Host.ts`. No inline type definitions in the keyboard package.
- **Entity-based creation:** `createSoftKeyboard` returns `SoftKeyboard & Entity` via `createEntity` — correct.
- **Full unabbreviated names:** every export uses `SoftKeyboard` unabbreviated — correct.
- **Out-parameter pattern:** `getSoftKeyboardInfo(host, out)` — correct. However, the function delegates directly to the backend's `getInfo(out)` without reading into locals first, so alias safety depends on the backend implementation.
- **Sentinel returns, no throws:** all functions return typed result unions or plain values. No `throw` statements — correct.
- **SDK barrel:** `packages/sdk/src/index.ts:59` re-exports `@flighthq/keyboard` — correct.
- **`package.json` description** ("visibility, height, and show/hide/resize signals over a swappable web/native backend") references the old swappable-backend model; the v3 rewrite uses direct host witness dispatch. Mildly stale.
- **Prior review/assessment staleness:** the assessment (`2026-07-07`) recommends documenting `transition.height` limitation — that type no longer exists. The approved item is obsolete by deletion.

### Candidate contract/doc revisions

- `package.json` description should reference the `Has*` witness dispatch model, not "swappable web/native backend."
- `assessment.md`'s sole recommended and approved item (document `transition.height`) is obsolete — `SoftKeyboardTransition` was deleted in the v3 rewrite.

## Candidate open directions

Carried from charter (all still live):

- The keyboard/textinput boundary for per-field traits.
- Safe-area/`@flighthq/device` coordination.
- Open vs closed kinds for `SoftKeyboardResizeMode` and `SoftKeyboardStyleKind` — de facto resolved as open in source; needs a charter Decision to bless.

New from this review:

- The eager-signal-allocation pattern: should keyboard adopt the `enable*Signals` gate per the shared principle, or does the three-signal-always shape warrant an exception?
- Visibility authority: should `attachSoftKeyboard`'s signal logic use the `visible` field rather than deriving visibility from `height > 0`?
- `disposeSoftKeyboard` signal teardown: should disposal disconnect signal listeners, or is GC-via-WeakMap sufficient?
