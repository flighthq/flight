---
package: '@flighthq/input'
crate: flighthq-input
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# input — Charter

## What it is

`@flighthq/input` is the raw-system-input normalization layer. It turns host (DOM) keyboard, pointer, relative-pointer, wheel, gamepad, and text/IME events into a portable, backend-agnostic representation and dispatches it over signals — with stable key codes, L/R-distinguished modifier flags, W3C gamepad button/axis naming, and dead-zone math. On top of the event stream it maintains an optional **held-state snapshot** (`InputState` + `is*Down`/`get*`) and **per-frame edge tracking** (`justPressed*`/`was*`/`endInputStateFrame`) — the canonical game-loop query surface.

It ends where its consumers begin. `input` produces normalized events and queryable state; it does **not** hit-test or route those events to display objects (that is `@flighthq/interaction`), define the signal/slot machinery (that is `@flighthq/signals`), or own the cross-package event/state types (those live in `@flighthq/types`). Whether it also climbs up into actions, bindings, and gestures — or stays a pure normalization seam — is the central Open direction below.

## North star (proposed)

_Proposed principles inferred from the design and the SDK forks. Edit or demote any of these to an Open direction during review._

- **Normalize, don't interpret.** The package's job is to make every host's raw input look the same — stable key codes, consistent modifier bitmasks, W3C gamepad semantics, normalized pointer/pen fields — not to decide what an input _means_. Meaning (actions, gestures, hit-test routing) is a consumer's concern.
- **Zero per-event allocation.** The hot path runs once per OS event. Scratch payload singletons, `out`-param dead-zone math, and reused coalesced-event payloads keep the steady state allocation-free; `create*` is the only verb that may allocate. This is a load-bearing property, not an optimization.
- **Opt-in, side-effect-free wiring.** No listeners, timers, or global mutation at import. Callers opt into every capability explicitly via `attach*`/`detach*` pairs (idempotent, teardown tracked off-object) and `create*`/`connect*`. Holding nothing and re-attaching cleanly is the contract.
- **Portable by construction, web by default.** The normalized representation is the product; the DOM is one source of it. The bar is that a non-DOM host (native, Rust) can feed the same normalized events and state through the same surface — see the backend-seam Open direction for whether that is enforced via a seam or left implicit.
- **Sentinels over throws.** Disabled managers short-circuit; missing capabilities (no `getGamepads`, unknown keys, off-standard mappings, unavailable pointer-lock) return `null`/`false`/`-1`/`UNKNOWN` and never throw. Throwing is reserved for genuine API misuse.

## Boundaries (proposed)

_Proposed scope lines drawn from the review and neighbors. Confirm or move during review._

**In scope (today):**

- Device normalization for keyboard, pointer, relative pointer, wheel, gamepad, and text/IME, each as an `attach*`/`detach*` pair over a host source.
- Normalization primitives: key-code resolution (incl. numpad-by-location, F13–F24, media/system keys), modifier bitmasks, wheel-mode mapping.
- Queryable held state and per-frame edge tracking (`InputState`, `is*Down`, `was*`, `endInputStateFrame`).
- Gamepad semantics: dead zones (linear + radial), W3C button/axis naming, mapping-kind threading, key-repeat synthesis for non-DOM sources.

**Proposed non-goals (candidates — several are live Open directions):**

- Hit-testing and routing input to display objects → `@flighthq/interaction`.
- The signal/slot mechanism itself → `@flighthq/signals`.
- Cross-package event/state type definitions → `@flighthq/types`.
- Action/binding maps and rebinding → _proposed_ `@flighthq/input-bindings` (undecided).
- Gesture recognizers (tap, swipe, pinch, rotate) → _proposed_ `@flighthq/gestures` (undecided).
- Gamepad mapping database (`GameControllerDB`-style) → _proposed_ `@flighthq/gamepad-mappings` (undecided, plurality case).
- Gamepad rumble/vibration — blocked on the backend seam (native rumble routes through a backend).
- Accelerometer/gyroscope/orientation and on-screen-keyboard events → `@flighthq/sensors` / `@flighthq/keyboard` (boundary undecided).

## Decisions

None blessed yet.

## Open directions

_Every candidate question carried forward from review.md, plus the structural forks that touch this package. These are where uncertainty lives — to be settled in a direction session._

1. **Normalization seam or full game-input library?** The depth review framed `input` as a deliberately thin normalization layer; this pass added held state, frame edges, and gamepad semantics that push it toward "library." The charter must state the intended scope — it decides whether the gaps below are missing-by-design or missing-by-omission. _(Most of the proposed North star and Boundaries hinge on this answer.)_

2. **The `InputBackend` seam (structural fork D — runtime backend seam).** Today every `attach*` takes a DOM `EventTarget`/`HTMLElement`/`Window` directly, so "portable, backend-agnostic" is aspirational rather than enforced. Do `attach*` keep DOM-target signatures _alongside_ a backend path, or route entirely through a `*Backend`? This is the gate for native hosts, gamepad rumble, multi-device identity, and Rust parity — the single highest-leverage undecided question.

3. **Neighbor-package boundaries (structural forks A & E — source-data/participation, bedrock test).** Bless or reject three proposed cells, each a subject-triad / new-cell decision rather than a within-package sweep:
   - `@flighthq/input-bindings` — action sets, rebinding, chord/combo recognition.
   - `@flighthq/gestures` — tap/double-tap/long-press/swipe/pinch/rotate recognizers; the timestamp + coalesced-event preconditions are now met, so only the package-shape call blocks it.
   - `@flighthq/gamepad-mappings` — an SDL `GameControllerDB`-style registry; the deferred plurality case (≥2 mapping sources → registry).

4. **Boundary with `@flighthq/sensors` and the platform event-suite.** Where do accelerometer/gyroscope/orientation and on-screen-keyboard (soft keyboard) events live relative to `input`? Currently unresolved.

5. **Signal-cost model (`enableInputSignals`?).** `createInputManager` eagerly folds in all 15 signals via `...createInputSignals()` with no `enable*` opt-in seam — a departure from the codebase-map `enableDisplayObjectSignals` convention. Defensible (signals are this package's _sole_ delivery mechanism, so a manager without them is inert), but settle it as a blessed Decision either way so the eager fold is documented intent rather than drift.

6. **`GamepadMappingKind` shape (structural fork B — closed union vs. open registry).** It carries a `*Kind` name but is a closed string union (`'standard' | 'raw' | ''`), unlike its `GamepadButtonKind`/`GamepadAxisKind` siblings which are object-constant registries. Defensible (the W3C mapping-state set is genuinely bounded), but it reads inconsistently against the kind-as-string-constant convention — a naming/shape question for the types-layout doc.

7. **TS↔Rust conformance-map drift.** The crate's native push-dispatch family (`dispatch_*`, `dispose_input_manager`, `poll_gamepad_snapshots`) has no TS counterpart and is only implicitly covered by the conformance map's "DOM input wiring" phrase, which does not name `input`; `poll_gamepad_input` is a Rust no-op stub. These should be recorded explicitly in the divergence map.

8. **Multi-device identity / hot-plug beyond gamepads.** No `InputDeviceId` or generalized `onInputDeviceConnect`/`Disconnect` for keyboard/mouse — relevant for native hosts with multiple keyboards/mice. In or out of scope?

9. **Stale Package Map / `package.json` description.** The Package Map line and the package `description` predate the state-snapshot, frame-edge, and gamepad-semantics surface (the description omits gamepad entirely). Both undersell current scope and want a revision once the scope question (1) is settled.
