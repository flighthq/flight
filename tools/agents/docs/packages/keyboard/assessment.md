---
package: '@flighthq/keyboard'
updated: 2026-06-25
basedOn: ./review.md
---

# keyboard — Assessment (merge gate: integration-b2824e3d8)

The keyboard **source** delta is an idiomatic, well-tested event-capability upgrade (will/did phases, frame rect, native-control commands, Chromium VirtualKeyboard web path). But as carried in `integration-b2824e3d8` it **does not compile**: it imports `SoftKeyboardPhase` / `SoftKeyboardResizeMode` / `SoftKeyboardStyleKind` / `SoftKeyboardTransition` and the value consts `SoftKeyboardResizeNoneKind` (+ `…BodyKind`, `…StyleDarkKind`, `…StyleDefaultKind` in the test), uses `SoftKeyboardInfo.x/y/width` and a 9-signal `SoftKeyboard`, and calls optional `SoftKeyboardBackend` methods — none of which exist in the head `@flighthq/types`, which is byte-identical to base for keyboard. The single blocking item is therefore cross-package: **the `@flighthq/types` keyboard edits must travel with this source change.** Nothing within `@flighthq/keyboard` alone can fix it, so the Recommended (sweep-safe, within-package) set is empty for this gate, and the blocker is in Backlog with its grounded reason. The pre-existing Gold/decision items carry forward.

## Recommended

Sweep-safe within-package work that a blanket "do all recommended" could bless. **For this merge gate, none** — the only blocking action (carry the `@flighthq/types` edits) is cross-package and cannot be a `@flighthq/keyboard`-local sweep. Once the types land and the package compiles, the prior assessment's within-package test/doc sweep applies; it is restated here as the post-merge Recommended set, but it must not be swept while the package does not build:

- **(post-build) Multi-listener / event-edge stress tests** across the `onWill*`→`onDid*` ordering, rapid show/hide bursts, and re-entrancy during emit. Pure test addition over the existing entity. (review.md → minor observations; roadmap Gold → robustness.)
- **(post-build) Idempotency / teardown audit tests** — re-entrancy during emit, double-`detach`, dispose-after-detach. The delta already adds happy-path coverage here (`b2824e3d8:packages/keyboard/src/keyboard.test.ts` `detachSoftKeyboard`/`disposeSoftKeyboard` blocks); harden the edges. Test-only.
- **(post-build) Full backend-absence edge-case suite** — no `window`, no `visualViewport`, no `navigator.virtualKeyboard`, the shrink-fallback vs. VirtualKeyboard path, and every native-control sentinel/no-op. Test-only.
- **(post-build) Package usage doc** — the keyboard-aware layout recipe (will-phase timing + `SoftKeyboardTransition.durationSeconds` + frame rect) and a resize-mode/style/accessory-bar matrix. Doc-only.

## Backlog

Parked — each names _why_ it is not a within-package sweep. None may be swept by a blanket approval.

- **[MERGE BLOCKER] Carry the `@flighthq/types` keyboard edits into the integration branch.** _Parked from Recommended because it is cross-package:_ the fix is in `@flighthq/types`, not `@flighthq/keyboard`. The four `SoftKeyboard*.ts` type files, the `x`/`y`/`width` fields on `SoftKeyboardInfo`, `SoftKeyboardPhase`, the 9-signal `SoftKeyboard`, the `subscribe(phase, transition)` signature, the seven optional `SoftKeyboardBackend` methods, and the `index.ts` re-exports are all absent from head types but required by the head keyboard source. Until they land in the same branch, the keyboard package does not typecheck. This blocks merge. (review.md → "The blocker".)
- **`SoftKeyboardEasingKind` wiring** — five easing kinds were intended to ship in `types` but are unwired (`SoftKeyboardTransition` carries only `durationSeconds` + `height`, no `easing`, no kind→`@flighthq/easing` lookup). _Parked:_ pulls a new `@flighthq/easing` dependency into a dep-light cell and needs kind-value namespacing settled (`'linear'`/`'ease'` would collide with easing's vocabulary). Decision before task. (Note: in this bundle the easing kinds are not even present in `types`.)
- **Field-attribute controls** (`setSoftKeyboardType` / `setSoftKeyboardReturnKey` / `setSoftKeyboardAutoCapitalize` / `setSoftKeyboardAutoCorrect` / `setSoftKeyboardSpellCheck`). _Parked:_ they associate with a focused field — `@flighthq/textinput`'s domain — and wait on the keyboard↔textinput boundary ruling.
- **Safe-area coordination** (`setSoftKeyboardSafeAreaInsetsEnabled` / inset reconciliation with `@flighthq/device`). _Parked:_ cross-package; whose job it is is undecided.
- **Open-vs-closed `*Kind` unions** (`SoftKeyboardResizeMode` / `SoftKeyboardStyleKind`) — closed unions whose own comments promise vendor-prefixed host extensions, which a closed type forbids (structural-fork B at the type level). _Parked:_ a one-line charter Decision resolves it; it is a `types`-package contract ruling, not a keyboard sweep.
- **Duplicate type re-export in `@flighthq/types`** — sub-types re-exported from both `Keyboard.ts` and `index.ts`. _Parked:_ lives in `@flighthq/types`; fold into a deliberate types-layout tightening. (Moot until the types edits land.)
- **Package Map line understated** — `tools/agents/docs/index.md` still says "on-screen keyboard visibility/height," omitting show/hide, will/did phases, resize-mode/style/accessory-bar/scroll-assist, and the frame rect. _Parked:_ shared admin doc edit, outside the package.
- **Rust crate `flighthq-keyboard`** — declared in the charter front matter; no crate exists yet. _Parked:_ a `rust`-worktree session, not a `@flighthq/keyboard` source change.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

## To route into the charter's Open directions

The charter is a stub; these design forks (all pre-existing, none a merge blocker) belong in the charter's Open directions — note them, do not act on them in a sweep:

1. **The keyboard↔textinput boundary** — the highest-value decision; settling it unblocks or relocates the field-attribute setters.
2. **`SoftKeyboardEasingKind` scope + wiring + value namespacing** — confirm the `@flighthq/easing` dependency before adding `easing` to `SoftKeyboardTransition`.
3. **Open vs. closed `*Kind` unions** (structural-fork B) — open/host-extensible vs. closed unions.
4. **Safe-area / `@flighthq/device` coordination** — whose job keyboard-aware inset adjustment is.
5. **Rust conformance timing** — when `flighthq-keyboard` gets ported.
