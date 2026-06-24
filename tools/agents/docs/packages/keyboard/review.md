---
package: '@flighthq/keyboard'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/keyboard.md
  - source
  - incoming/builder-67dc46d64
---

# keyboard — Review

## Verdict

`solid` — 90/100. The builder pass took an already-clean event-capability cell from 80 to a near-complete soft-keyboard surface: will/did animation phases, a frame rect in the snapshot, the native control extensions the prior depth review named as the gap-to-authoritative (resize mode, style, accessory bar, scroll assist), and a real Chromium VirtualKeyboard integration on the web default. Every worker claim in `status.md` checks out against the diff. The remaining distance to `authoritative` is the deliberately-deferred Gold items — the `SoftKeyboardEasingKind` types ship unused, field-attribute controls await the `textinput` boundary decision, and there is no Rust crate yet — plus a couple of small contract notes. The domain is narrow and well-bounded; this is a faithful, idiomatic cell, not a stub.

## Status-doc verification (AS-CLAIMED → verified)

Read against `<67dc46d64>:packages/keyboard/src/keyboard.ts`, `keyboard.test.ts`, the four new `types/src/SoftKeyboard*.ts` files, and `types/src/Keyboard.ts`. Every claim holds:

- **20 exported functions** — confirmed in `dist/keyboard.d.ts` (8 new, alphabetized, each with a colocated `describe` in `keyboard.test.ts`). Up from 12.
- **Four new type files** (`SoftKeyboardTransition`, `SoftKeyboardEasingKind`, `SoftKeyboardResizeMode`, `SoftKeyboardStyleKind`) — present, one-concept-per-file, all four re-exported from `types/src/index.ts` (lines 363-366) and from `Keyboard.ts` (line 72).
- **`SoftKeyboardInfo` rect fields** (`x`/`y`/`width`), **`SoftKeyboardPhase`**, the **9-signal `SoftKeyboard`** (will/did/simple triads), and the **optional native backend methods** — all present in `Keyboard.ts` exactly as described.
- **42 tests** — `keyboard.test.ts` has 20 `describe` blocks mirroring the 20 exports, alphabetized; the will-phase, did+alias co-emission, idempotent re-attach, detach/dispose safety, sentinel-fallback, and no-op-when-unsupported cases are all present.
- **Web backend VirtualKeyboard integration** — `getVirtualKeyboard()`, `geometrychange` subscription, real `show()`/`hide()` when `navigator.virtualKeyboard` exists, `visualViewport` fallback — all confirmed; `getWebKeyboardGeometry` replaced `getWebKeyboardHeight` as claimed.

The status doc is an accurate, honest record. Its own listed concerns (duplicate type re-export, `SoftKeyboardTransition` lacking `easing`, web `show`/`hide` now conditional) are real and reproduced below where they bear on contract fit.

## Present capabilities

Exported surface (20 functions, all colocated-tested):

- **Lifecycle quartet** — `createSoftKeyboard()` (allocates all 9 signals), `attachSoftKeyboard()` (idempotent: tears down a prior subscription first), `detachSoftKeyboard()` (safe when not attached / called twice), `disposeSoftKeyboard()` (detach-to-GC; correct verb, no non-GC resource to `destroy`). Matches the platform-suite event-capability shape precisely.
- **Snapshot** — `createSoftKeyboardInfo()` (zeroed `out` allocator, now including `x/y/width`), `getSoftKeyboardInfo(out)` (`out`-param reader, returns `out`), and `getSoftKeyboardHeight()` (zero-alloc single-value reader via module `_scratch`).
- **Transition** — `createSoftKeyboardTransition()` zeroed allocator for the will-phase payload.
- **Will/did phase dispatch** — `attachSoftKeyboard`'s subscribe callback splits on `phase`: `'will'` emits `onWillShow`/`onWillHide`/`onWillResize` with the `SoftKeyboardTransition`; `'did'` emits `onDidResize`+`onResize` always, plus `onDidShow`/`onShow` or `onDidHide`/`onHide` on a visibility edge. Visibility edge (`wasVisible`) commits only on did-phase — correct for a native will→did predict-then-commit sequence.
- **Native control extensions** — `getSoftKeyboardResizeMode()`/`setSoftKeyboardResizeMode()`, `setSoftKeyboardStyle()`, `isSoftKeyboardAccessoryBarVisible()`/`setSoftKeyboardAccessoryBarVisible()`, `isSoftKeyboardScrollAssistEnabled()`/`setSoftKeyboardScrollAssistEnabled()`. Each delegates to an optional backend method and returns a sentinel (`SoftKeyboardResizeNoneKind` / `false`) or no-ops when the backend omits it — the web default omits all of them.
- **Backend seam** — `getSoftKeyboardBackend()` (lazy web default, never null), `setSoftKeyboardBackend(null)` (native override / reset), `createWebSoftKeyboardBackend()`. The web backend prefers the Chromium VirtualKeyboard API (`boundingRect` geometry, real `show`/`hide`) and falls back to `visualViewport` shrink inference, guarding `window`/`navigator`/`visualViewport` absence and degrading to height 0.
- **Commands** — `showSoftKeyboard()`/`hideSoftKeyboard()` delegate to the backend.
- **Type vocabulary** — `SoftKeyboardResizeMode` (`body`/`native`/`none`/`ionic`), `SoftKeyboardStyleKind` (`default`/`light`/`dark`), `SoftKeyboardEasingKind` (`ease`/`easeIn`/`easeOut`/`linear`/`keyboardDefault`), all canonical against Capacitor/iOS/Android.

`"sideEffects": false`, lazy backend creation, and module-bottom `_backend`/`_scratch`/`_subscriptions` honor the no-top-level-side-effects and source-style rules. Naming is fully self-identifying — every function carries the `SoftKeyboard` type word, `is*`/`get*`/`set*`/`create*` prefixes are correct.

## Gaps vs an authoritative soft-keyboard library

- **`SoftKeyboardEasingKind` is defined but entirely unwired.** The five easing kinds exist in `types`, but `SoftKeyboardTransition` carries only `durationSeconds` + `height` — no `easing` field — and the keyboard package has no kind→`@flighthq/easing` lookup. An app cannot drive a content tween with the platform curve today; it gets duration only. This is the single most visible "designed but not finished" seam, and it is the gap most apps would reach for after will-phase timing. The status doc flags it as a Gold deferral (adds an `@flighthq/easing` dep, sequenced after the backend shape settles).
- **Field-attribute controls absent** — `setSoftKeyboardType` / `setSoftKeyboardReturnKey` / `setSoftKeyboardAutoCapitalize` / `setSoftKeyboardAutoCorrect` / `setSoftKeyboardSpellCheck`. These are real native keyboard features (Capacitor input traits, iOS `UIKeyboardType`/`UIReturnKeyType`), correctly deferred because they associate with a focused field — `@flighthq/textinput`'s domain — and the package/seam split needs a ruling first.
- **No safe-area coordination** — `setSoftKeyboardSafeAreaInsetsEnabled` / inset reconciliation with `@flighthq/device`. A cross-package surface, correctly surfaced rather than acted on.
- **No Rust crate** (`crates/flighthq-keyboard`). The charter front matter declares `crate: flighthq-keyboard`, but the conformance mirror does not exist yet. The work was done in the builder worktree, which has no `crates/`; the port is a `rust`-worktree task. Recorded as a conformance gap.
- **Robustness coverage thin on multi-listener edges** — no tests for signal priority/cancellation across the will/did edges, rapid show/hide bursts, or re-entrancy during emit. The single-listener happy paths are covered well; the stress matrix the platform suite implies for an event entity is not.

## Charter contradictions

None. The charter's "What it is" section (the only filled section) states the boundary precisely — global soft-keyboard visibility/height/style/resize-mode/accessory-bar, explicitly NOT physical-key input (`@flighthq/input`), type `SoftKeyboard` avoiding the DOM `Keyboard`. The code holds that line exactly: nothing here touches key codes, modifiers, or IME composition, and the deferred field-attribute controls were correctly _not_ built here precisely because they cross into `textinput`. North star, Boundaries, Decisions, and Open directions are all still `TODO` stubs, so there is little else to contradict — see candidate open directions.

## Contract & docs fit

How well the package lives up to the contract:

- **`@flighthq/types`-first** — all shapes (`SoftKeyboard`, `SoftKeyboardBackend`, `SoftKeyboardInfo`, `SoftKeyboardPhase`, the three kind unions, `SoftKeyboardTransition`) live in `types`; the package imports them and defines nothing cross-package inline. Correct.
- **Full unabbreviated names, `out`-params, sentinels-not-throws, single root export, `sideEffects: false`** — all satisfied. `getSoftKeyboardInfo`/`createSoftKeyboardInfo` honor the `out` convention; every native-control reader returns a sentinel; `index.ts` is a thin `export * from './keyboard'`.
- **String-kind identity** — the three `*Kind` unions are plain string consts with `as const` + matching type aliases, per the types-layout convention. **Candidate contract note:** the unions are _closed_ (`SoftKeyboardResizeMode = body | native | none | ionic`). The types-layout doctrine is "open contracts, not closed unions," and `SoftKeyboardResizeMode.ts`'s own comment says "hosts can register vendor-prefixed extensions (e.g. 'acme.custom')" — but the closed union type forbids exactly that without a cast. This is a minor open-vs-closed drift (structural-fork B at the type level): either widen the type to `string & {}`-style open kinds, or drop the "vendor-prefixed extensions" promise. Low-stakes (no hot loop, no registry dispatch), but a real contract-fit inconsistency.

Where the contract / admin docs are stale against the work:

- **Package Map line is now understated.** `tools/agents/docs/index.md` describes `@flighthq/keyboard` as "on-screen keyboard visibility/height (type `SoftKeyboard`, avoiding the DOM `Keyboard`)." After this pass it also owns show/hide, will/did animation phases, resize-mode/style/accessory-bar/scroll-assist controls, and a keyboard frame rect. **Candidate revision:** broaden the map line to reflect the control surface, so it matches the cell's actual scope.
- **Duplicate type surface** (status-doc concern, verified): `Keyboard.ts` re-exports the four sub-types via `export type { … }` (line 72) _and_ `index.ts` re-exports the same files directly (lines 363-366). Harmless to `tsc` and intentional per the worker, but it does double the four names in the `types` index surface. Worth a deliberate ruling — pick one re-export site — when the types-layout convention is next tightened.
- **`SoftKeyboardEasingKind` values are bare, generic strings** (`'ease'`, `'easeIn'`, `'easeOut'`, `'linear'`) — not `SoftKeyboard`-prefixed and not vendor-namespaced. If these are ever keyed into a shared `@flighthq/easing` kind registry, `'linear'`/`'ease'` would collide with easing's own vocabulary. Acceptable if the lookup is package-local, but flag before the easing wiring lands.

## Candidate open directions

The charter's North star / Boundaries / Decisions / Open directions are all `TODO`. Each assumption I had to make to review becomes a question for the user to settle:

- **Where does the keyboard↔textinput boundary fall?** The status doc and depth review both lean "this package owns the _global_ keyboard; per-field input traits (type/return-key/autocap/autocorrect/spellcheck) live in `textinput` and merely _influence_ the keyboard." That is a clean rule but unblessed. Settling it unblocks (or relocates) the Gold field-attribute setters. **The highest-value charter decision to make.**
- **Is `SoftKeyboardEasingKind` in scope, and how does it wire?** Adding `easing` to `SoftKeyboardTransition` plus a kind→`@flighthq/easing` lookup pulls an `easing` dependency into a currently dependency-light cell (only `signals` + `types`). Confirm the dependency and the kind-value namespacing (above) before building.
- **Open vs closed kinds.** Should `SoftKeyboardResizeMode`/`SoftKeyboardStyleKind` be open (host-extensible, matching their own comments and fork B) or stay closed unions? A one-line charter Decision resolves the drift.
- **Safe-area / `@flighthq/device` coordination** — is keyboard-aware safe-area inset adjustment this package's job, `device`'s, or a consumer's? Cross-package; needs a ruling.
- **Rust conformance timing** — when does `flighthq-keyboard` get ported? The charter already declares the crate; the implementation is a clean 1:1 mirror (signals, info, backend trait, free functions, string-kind consts, will/did dispatch) per the status doc, awaiting a `rust`-worktree session.
