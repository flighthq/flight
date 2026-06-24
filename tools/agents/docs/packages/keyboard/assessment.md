---
package: '@flighthq/keyboard'
updated: 2026-06-24
basedOn: ./review.md
---

# keyboard — Assessment

`keyboard` is `solid` (90/100): a faithful, idiomatic event-capability cell whose Bronze and Silver roadmap tiers have both landed (will/did phases, transition payload, frame rect, the native control surface, and a real Chromium VirtualKeyboard web path). The remaining distance to `authoritative` is almost entirely **Gold-tier** work that is either cross-package (easing, textinput, device, the Rust port) or a real design decision — so it is parked, not swept. What is left strictly _within_ `@flighthq/keyboard` and free of any open decision is the robustness/test sweep and a usage doc; that is the Recommended set.

The charter is still a stub (North star / Boundaries / Decisions / Open directions are all `TODO`), so the four design forks below are routed to the charter's **Open directions** for an explicit conversation rather than into Recommended.

## Recommended

Sweep-safe: each item is within `@flighthq/keyboard`, adds no dependency, breaks no API, and settles no open design question. A blanket "do all recommended" can safely bless this set.

- **Multi-listener / event-edge stress tests.** Add coverage for signal priority and cancellation across the `onWill*`→`onDid*` ordering, rapid show/hide bursts, and re-entrancy during emit. The review flags this as the one thin spot: the single-listener happy paths are well covered, but the stress matrix the platform suite implies for an event entity is not. Pure test addition over the existing entity; no source change required. (review.md "Gaps" → robustness; roadmap Gold → Robustness & ergonomics.)
- **Idempotency / teardown audit tests.** Lock down `attachSoftKeyboard` re-entrancy during emit, double-`detach`, and dispose-after-detach with explicit tests. The attach flow is already idempotent (tears down a prior subscription first) and the happy-path detach/dispose-safety cases exist; this hardens the edges into a regression net. Within-package, test-only. (roadmap Gold → Robustness & ergonomics.)
- **Full backend-absence edge-case suite.** Exercise every degradation path of the web default: no `window`, no `visualViewport`, no `navigator.virtualKeyboard`, the `visualViewport`-shrink fallback vs. the VirtualKeyboard path, and every native-control sentinel/no-op return. These are the guards the web backend already implements; the tests pin them. Test-only, within-package. (roadmap Gold → Tests & docs.)
- **Package usage doc: the keyboard-aware layout recipe + resize-mode matrix.** A package-level doc showing the "animate content in sync with the keyboard slide" recipe (will-phase timing + `SoftKeyboardTransition.durationSeconds` + the frame rect) and a resize-mode/style/accessory-bar matrix. Documents only what already ships — the _easing-curve_ extension of this recipe is deferred with its dependency (see Backlog). Doc-only, no code or API change. (roadmap Gold → Tests & docs.)

## Backlog

Parked — each names _why_ it is not sweep-safe (a new dependency, a cross-package seam, another worktree, or an open design fork). None may be swept by a blanket approval.

- **`SoftKeyboardEasingKind` wiring** — the five easing kinds ship in `types` but are unwired: `SoftKeyboardTransition` carries only `durationSeconds` + `height`, and there is no kind→`@flighthq/easing` lookup. _Parked:_ pulls a new `@flighthq/easing` dependency into a currently dep-light cell (`signals` + `types` only) and requires settling the kind-value namespacing (`'linear'`/`'ease'` would collide with easing's own vocabulary if shared). Both are Open directions, not in-package work. The most-visible "designed but unfinished" seam, but it is a decision before it is a task.
- **Field-attribute controls** (`setSoftKeyboardType` / `setSoftKeyboardReturnKey` / `setSoftKeyboardAutoCapitalize` / `setSoftKeyboardAutoCorrect` / `setSoftKeyboardSpellCheck`). _Parked:_ these associate with a _focused field_ — `@flighthq/textinput`'s domain — so they wait on the keyboard↔textinput boundary ruling. Building them here before that ruling risks duplicating the seam. Surfaced as an Open direction.
- **Safe-area coordination** (`setSoftKeyboardSafeAreaInsetsEnabled` / inset reconciliation with `@flighthq/device`). _Parked:_ cross-package — whether keyboard-aware safe-area adjustment is this package's job, `device`'s, or a consumer's is undecided. Surfaced as an Open direction.
- **Open-vs-closed `*Kind` unions** — `SoftKeyboardResizeMode` / `SoftKeyboardStyleKind` are closed unions whose own comments promise vendor-prefixed host extensions (`'acme.custom'`), which the closed type forbids without a cast (structural-fork B at the type level). _Parked:_ a one-line charter Decision resolves the drift (widen to open kinds vs. drop the promise); it is a contract ruling, not a sweep. Low-stakes (no hot loop, no registry dispatch). Surfaced as an Open direction.
- **Duplicate type re-export in `@flighthq/types`** — the four `SoftKeyboard*` sub-types are re-exported both from `types/src/Keyboard.ts` and directly from `types/src/index.ts`, doubling the four names in the `types` index surface. _Parked:_ the fix lives in `@flighthq/types`, not in `@flighthq/keyboard` — cross-package; best folded into a deliberate types-layout tightening that picks one re-export site.
- **Package Map line understated** — `tools/agents/docs/index.md` still describes the package as "on-screen keyboard visibility/height," omitting the show/hide, will/did phases, resize-mode/style/accessory-bar/scroll-assist controls, and the frame rect now owned here. _Parked:_ the edit is to a shared admin doc outside the package, not within `@flighthq/keyboard`.
- **Rust crate `flighthq-keyboard`** — the charter front matter declares the crate, but no conformance mirror exists yet (the builder worktree has no `crates/`). _Parked:_ this is a `rust`-worktree session, not a `@flighthq/keyboard` source change. The port is a clean 1:1 mirror (signals, `SoftKeyboardInfo`, backend trait, free functions, string-kind consts, will/did dispatch) awaiting scheduling.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

## To route into the charter's Open directions

The charter is a stub; these are the design forks the review and roadmap surfaced. Note them for the charter — do not act on them in a sweep. (This skill does not edit the charter.)

1. **The keyboard↔textinput boundary** — the highest-value decision. Lean (from depth review + status): this package owns the _global_ keyboard (visibility/height/style/resize-mode/accessory-bar); per-field input traits live in `@flighthq/textinput` and merely _influence_ the keyboard. Settling it unblocks or relocates the Gold field-attribute setters.
2. **`SoftKeyboardEasingKind` scope + wiring** — confirm the `@flighthq/easing` dependency and the kind-value namespacing before adding `easing` to `SoftKeyboardTransition` and a kind→function lookup.
3. **Open vs. closed `*Kind` unions** (structural-fork B) — open/host-extensible (matching the kinds' own comments) vs. stay closed unions. A one-line Decision resolves the drift.
4. **Safe-area / `@flighthq/device` coordination** — whose job keyboard-aware inset adjustment is.
5. **Rust conformance timing** — when `flighthq-keyboard` gets ported (the crate is already declared).

## Roadmap absorbed

`reviews/maturation/depth/keyboard.md` (the Bronze/Silver/Gold roadmap) is absorbed here: Bronze and Silver have both landed (verified in review.md); the Gold tier is distributed above between Recommended (the robustness/test/doc sweep) and Backlog (easing, field-attributes, safe-area, the Rust port). The roadmap is one-time seed and can be removed once this assessment is in place.
