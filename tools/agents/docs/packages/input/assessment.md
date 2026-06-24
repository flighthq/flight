---
package: '@flighthq/input'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/input

> Recommendation layer. Sorts the review's gaps and the prior maturation roadmap into sweep-safe `Recommended` (within-package, no design decision) and parked `Backlog` (cross-package, larger, or blocked on an Open direction). `Approved` is frozen only on the user's verbal gate — left empty. Judged against the charter; the charter is a stub (North star / Boundaries / Decisions all `TODO`), so this falls back to the codebase-map AAA standard and routes every design fork to the charter's Open directions rather than into `Recommended`.

The maturation roadmap is **largely absorbed already**: Bronze (timestamps, `InputState` snapshot, pointer enrichment, `InputTextData`, options symmetry) and most of Silver (semantic gamepad mapping, dead-zones, coalesced events, key-repeat config, pointer-lock/capture helpers, frame-edge queries) have landed and verify in the review. What remains is a small set of within-package cleanups plus the roadmap's explicitly-deferred design forks. The maturation depth review (`reviews/maturation/depth/input.md`) is now spent — its actionable residue is captured below and it can be removed.

## Recommended

Sweep-safe: all within `@flighthq/input` (+ `@flighthq/types` for any payload type), no cross-package coupling, no breaking change, no open design decision.

- **Route `attachRelativePointerInput` through `setInputPointerData`.** The relative-pointer handler hand-assigns all 14 `_pointerData` fields inline (review Gaps; API-alignment flag) — a parallel codepath that can silently drift from the canonical writer. Widen `setInputPointerData` to also accept a `MouseEvent` (its pointer-specific reads are already `'field' in event`-guarded; map `movementX/Y` → `deltaX/deltaY`) and call it from the relative handler. Removes the duplicate field list and the drift surface. Keep the alias-safety/read-before-write discipline; add an aliased-`out` test.

- **Honor `preventDefault` in `attachRelativePointerInput` instead of `void options`.** The function takes `Readonly<AttachInputOptions>` for API symmetry but currently discards it (`void options`), unlike every other attach pair. Apply the same `const preventDefault = options?.preventDefault ?? true` gate to its `mousemove` handler so the option is real, not decorative. Small, self-contained.

- **Exhaustive key-code table fill.** Extend `keyCodesByCode` / `keyCodesByKey` to the full declared `KeyCode` enum — the international/IME keys and any numpad mem/hex/binary variants the enum declares that the tables still omit (this pass already added F13–F24, browser/media/system keys, `NumpadEqual`). Pure table completion against an existing enum; no new API, no decision. Add table-driven tests for the added rows.

- **Stale admin-doc text (within this package's manifest).** Update the `package.json` `description` to include **gamepad** and the state-snapshot/edge surface — it currently lists only "keyboard, pointer, wheel, and text events," underselling the package. (The `index.md` Package Map line is _also_ stale, but that file is outside this cell — see Backlog.)

## Backlog

Parked: each is cross-package, a new-cell/bedrock decision, or blocked on a charter Open direction. Reason given per item. None of these is in scope for a blanket "do all recommended."

- **`InputBackend` seam (fork D — runtime backend seam).** _Blocked on an Open direction._ The single highest-leverage structural gap (web-only host coupling), but it reshapes every `attach*` signature and the Rust mirror, and turns on a real fork: do `attach*` keep DOM-target signatures _alongside_ a backend path, or route entirely through a `*Backend`? Routed to charter Open direction #2; not a sweep.

- **Gamepad rumble / vibration.** _Blocked on the backend seam._ `hasGamepadVibration` / `setGamepadVibration` / `stopGamepadVibration` over `GamepadHapticActuator` must route through `InputBackend` so native hosts implement it natively. Can't land cleanly before the seam decision.

- **`@flighthq/input-bindings` neighbor (action/binding maps, rebinding, chord/combo).** _New-cell / bedrock decision._ Action sets, `InputAction`, serializable binding maps, chord recognition. Large and orthogonal; the review leans separate-package. Needs a name/boundary bless (bedrock test) → charter Open direction #3.

- **`@flighthq/gestures` neighbor (tap/double-tap/long-press/pan/swipe/pinch/rotate).** _New-cell / bedrock decision._ Its preconditions (Bronze timestamps + Silver coalesced events) are now met, so the only blocker is the package-shape decision. → charter Open direction #3.

- **`@flighthq/gamepad-mappings` neighbor (`GameControllerDB`-style database).** _New-cell, the triad `-formats`/plurality case._ Adds semantic names for `'raw'`/`''` pads (≥2 mapping sources → registry). A `-formats`-pattern neighbor, not a within-`input` add. → charter Open direction #3.

- **Multi-device identity & hot-plug beyond gamepads.** _Depends on the backend seam._ `InputDeviceId` and generalized `onInputDeviceConnect`/`Disconnect` for keyboard/mouse matter only for native hosts with multiple devices — which arrive via `InputBackend`. Park until the seam exists.

- **`input` ↔ `@flighthq/sensors` / platform event-suite boundary.** _Cross-package design question._ Where accelerometer/gyroscope/orientation and on-screen-keyboard events live relative to `input` is unresolved. → charter Open direction #4. Surface, do not act.

- **Signal-cost model (`enableInputSignals` vs eager fold).** _Needs a blessed Decision either way._ `createInputManager` eagerly folds all 15 signals (no `enable*` opt-in), departing from the `enableDisplayObjectSignals` convention. Defensible (signals are this package's sole delivery mechanism), but it should be a recorded Decision, not silent drift. → charter Open direction #5.

- **`GamepadMappingKind` shape (closed union vs object-constant registry).** _Types-layout convention question._ It is a `*Kind` name but a closed `'standard' | 'raw' | ''` union, unlike its `GamepadButtonKind`/`GamepadAxisKind` object-constant siblings. Defensible (the W3C set is fixed), but a naming/shape call for the types-layout doc owner, not a within-`input` edit.

- **TS↔Rust conformance-map drift.** _Cross-tree (Rust + conformance map)._ The crate's native push-dispatch family (the `dispatch_*` fns, `dispose_input_manager`, `poll_gamepad_snapshots`) has no TS counterpart and is unnamed in the conformance map; `poll_gamepad_input` is a Rust no-op stub. These belong in the divergence map explicitly — a conformance-doc/Rust task, not an `input` source change.

- **Stale Package Map line in `index.md`.** _Outside this cell._ The codebase-map description of `input` predates the state-snapshot + gamepad-semantics surface. Editing `tools/agents/docs/index.md` is a cross-cutting admin-doc change for the user's gate, not a within-package sweep (the in-cell `package.json` description fix is the Recommended half).

- **Full conformance test depth & functional harness.** _Larger / cross-tree._ Property tests (held-state snapshot vs signal replay), a synthetic-input functional/visual scene across backends, and Rust parity. Valuable but sized beyond a sweep and partly dependent on the backend seam and Rust port.

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._
