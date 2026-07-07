---
package: '@flighthq/input'
crate: flighthq-input
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# input — Charter

## What it is

`@flighthq/input` is the **full input library** — raw-system-input normalization (keyboard, pointer, relative-pointer, wheel, gamepad, text/IME via DOM), dispatched over 15 typed signals, plus held-state snapshots (`InputState`, `isInputKeyDown`, `isInputPointerButtonDown`, `getInputGamepadAxis`), per-frame edge queries (`wasInputKeyPressed`/`wasInputKeyReleased`, gamepad equivalents, `endInputStateFrame`), gamepad semantic naming (W3C standard mapping), linear and radial dead-zone math, key-repeat synthesis, pointer lock/capture helpers, and coalesced pointer event iteration. Zero per-event allocation via scratch singletons. 40 exports, 2 source files, ~104 tests. Dependencies: `signals`, `types`.

The package is a full input library, to be refactored down into more packages as needed — not a thin normalization seam. It ends where its consumers begin: `@flighthq/interaction` hit-tests and routes, `@flighthq/input-bindings` maps actions, `@flighthq/gestures` recognizes gestures.

## North star

1. **Full input library, not thin seam.** Normalize, snapshot, edge-track, and semantic-name all host input. Refactor into focused neighbor packages as areas grow.
2. **Zero per-event allocation.** Scratch singletons, `out`-param dead-zone math, reused payloads. Load-bearing property, not optimization.
3. **Opt-in, side-effect-free wiring.** No listeners/timers/globals at import. `attach*`/`detach*` pairs, `create*`/`connect*`.
4. **Portable by construction.** An `InputBackend` seam must exist so native hosts (Rust, Electron) feed normalized events without DOM. Web is one backend, not the only one.
5. **Sentinels over throws.** Missing capabilities return `null`/`false`/`-1`/`UNKNOWN`. Throws for API misuse only.

## Boundaries

**In scope:**

- Device normalization for keyboard, pointer, relative pointer, wheel, gamepad, text/IME.
- Held-state snapshots and per-frame edge tracking.
- Gamepad semantics: dead zones, W3C button/axis naming, key-repeat synthesis.
- Pointer lock/capture helpers, coalesced pointer iteration.
- `InputBackend` abstraction for multi-host portability.

**Non-goals:**

- Hit-testing and routing to display objects -- `@flighthq/interaction`.
- Signal/slot machinery -- `@flighthq/signals`.
- Cross-package event/state types -- `@flighthq/types`.
- Accelerometer/gyroscope/orientation -- `@flighthq/sensors`.

## Decisions

- **[2026-07-02] Full input library, refactored as needed.** Ratified as a full game-input library (not a thin normalization seam). Dead zones, semantic gamepad naming, edge queries, key-repeat timers are all in scope. Refactor into focused neighbor packages when areas grow complex enough to warrant extraction.

  **Why:** The code already commits to "library" with held state, frame edges, and gamepad semantics. The charter ratifies what the code already is, with a clear growth model: extract, don't bloat.

- **[2026-07-02] `InputBackend` seam required.** All `attach*` must be generalized to work through a backend abstraction, not just raw DOM targets. The seam enables Rust native hosts, Electron, and any non-browser environment.

  **Why:** Every other platform-integration package has a `*Backend` seam. Input is the missing one. Portability is a first-class constraint, not aspirational.

- **[2026-07-02] Three neighbor packages blessed.** `@flighthq/input-bindings` (action maps, rebinding, chord/combo), `@flighthq/gestures` (tap/swipe/pinch/rotate recognizers), `@flighthq/gamepad-mappings` (SDL GameControllerDB-style registry). All three are wanted.

  **Why:** Each is a distinct concern that doesn't belong in the core input library but naturally extends it.

- **[2026-07-02] `GamepadMappingKind` — open registry with preset methods.** Not a closed union. Register well-known variants (W3C standard, raw) via preset `register*` functions; users add their own.

  **Why:** SDK convention leans toward open registries. Gamepad mappings grow with new controllers. Preset methods give the ergonomics of a closed set without closing the set.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **`InputBackend` shape.** What does the backend interface look like? Does it wrap `attach*`/`detach*` pairs, or does it push events directly? How does it relate to the `WindowBackend` in application?

2. **`enableInputSignals` opt-in.** `createInputManager` eagerly folds all 15 signals. Signals are this package's sole delivery mechanism, so a manager without them is inert — but the pattern differs from `enableDisplayObjectSignals`. Bless the eager fold or add an opt-in.

3. **Neighbor package shapes.** `input-bindings`, `gestures`, `gamepad-mappings` are blessed but undesigned. Each needs its own direction session when built.

4. **Multi-device identity.** No `InputDeviceId` or generalized connect/disconnect for keyboard/mouse. Relevant for native hosts with multiple input devices.

5. **Package Map update.** Current entry undersells scope — omits gamepad, state snapshots, edge queries.
