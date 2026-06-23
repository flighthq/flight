# API Alignment: @flighthq/keyboard

**Verdict:** Strongly aligned — the package is a faithful instance of the event-capability seam shared by `network`/`power`/`lifecycle`, with full unabbreviated type words, correct verbs, and proper `out`/sentinel discipline; only minor completeness gaps, no convention violations.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | (package) | No boolean convenience accessor for visibility. Sibling event packages expose a sentinel-style boolean shortcut over the snapshot — `network` has `isNetworkOnline()`. `keyboard` forces callers to allocate/pass a `SoftKeyboardInfo` and read `.visible`. | Add `isSoftKeyboardVisible(): boolean` (delegating to `getSoftKeyboardBackend().getInfo(_scratch).visible`), mirroring `isNetworkOnline`. Correct `is*` prefix for a boolean. |
| Info | `getSoftKeyboardInfo(out)` | `out` param is typed `SoftKeyboardInfo` (mutable), which is correct for an out-param. No `Readonly<>` is warranted here; flagged only to confirm it was reviewed against the Readonly rule and is intentional. | None — keep mutable `out`; consistent with `getNetworkStatus(out)` / `getPowerStatus(out)`. |
| Info | `attachSoftKeyboard` / `detachSoftKeyboard` / `disposeSoftKeyboard` (`keyboard: SoftKeyboard`) | Entity param is not `Readonly<SoftKeyboard>`, but the function mutates delivery state keyed on the entity (WeakMap subscription) and emits its signals; siblings treat the entity identically (`attachNetwork(net: Network)`). | None — entity identity is the point; matches sibling pattern. |

## Clean

- **Full, unabbreviated type words.** Every export spells `SoftKeyboard` / `SoftKeyboardInfo` / `SoftKeyboardBackend` in full (`attachSoftKeyboard`, `createSoftKeyboardInfo`, `getSoftKeyboardBackend`). No abbreviation, no `getSKInfo`-style shortening.
- **Globally unique root names.** `Soft`-prefixed names avoid collision with `@flighthq/input` (`attachKeyboardInput`, `getKeyCodeFromDomKeyboardEvent`) and `@flighthq/textinput` (`handleTextInputKeyboard`); the deliberate `SoftKeyboard` word also dodges the DOM `Keyboard` per the package map.
- **Verb consistency with sibling event packages.** `create*` / `createWebSoftKeyboardBackend` / `getSoftKeyboardBackend` / `setSoftKeyboardBackend` / `attachSoftKeyboard` / `detachSoftKeyboard` / `disposeSoftKeyboard` map 1:1 onto the `network`/`power`/`lifecycle` event-capability shape (`attach*`/`detach*`/`dispose*`/`create*`/`createWeb*Backend`/`get*Backend`/`set*Backend`).
- **Allocation by verb.** `createSoftKeyboard`, `createSoftKeyboardInfo`, `createWebSoftKeyboardBackend` allocate; `getSoftKeyboardInfo(out)` writes into the caller's `out` and allocates nothing — correct hot-path discipline.
- **Alias-safe out-param.** The web `getInfo(out)` reads `getWebKeyboardHeight()` into a local before assigning `out.height`/`out.visible`; no read-after-write hazard if `out` aliases scratch.
- **Sentinels over throws.** No thrown errors. `getSoftKeyboardBackend()` always returns a backend (lazy web default); absent `visualViewport` degrades to height `0`, `visible:false`, and no-op subscribe/show/hide rather than throwing.
- **Teardown verbs.** `disposeSoftKeyboard` (detach subscription → release to GC) is the correct verb for a GC-managed entity with no native resource; no misuse of `destroy*`. `detachSoftKeyboard` is idempotent and safe when not attached.
- **`get*` accessors.** `getSoftKeyboardBackend` and `getSoftKeyboardInfo` are genuine getters returning their named type, not booleans or actions.
- **Imports & type seam.** `import type { SoftKeyboard, SoftKeyboardBackend, SoftKeyboardInfo }` is on its own `import type {}` line, separate from the value import of `createSignal`/`emitSignal`. All cross-package types live in `@flighthq/types` (`packages/types/src/Keyboard.ts`); none defined inline.
- **Side-effect-free.** Module-level state (`_backend`, `_scratch`, `_subscriptions`) is inert; no top-level registration or listener wiring. `"sideEffects": false` is honored.
- **Exports alphabetized** within `keyboard.ts` (attach → create → detach → dispose → get → hide → set → show); single-file barrel `index.ts` re-exports cleanly.
