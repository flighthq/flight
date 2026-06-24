---
package: '@flighthq/input'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/input.md
  - reviews/alignment/api/input.md
  - reviews/alignment/deps/input.md
  - reviews/alignment/ts-rust/input.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/input

> Survey layer. Observation only — no recommendations, no sequencing. Evidence from the incoming bundle `builder-67dc46d64` (`incoming/builder-67dc46d64/head/packages/input/`, `changes.patch`). Supersedes the prior depth review (70/100); absorbs the three alignment reviews.

## Verdict

**solid — 84/100.** A clean, allocation-disciplined DOM input-normalization layer that, since the depth review, has grown the three layers that review named as its biggest gaps: a queryable **held-state snapshot** (`InputState` + `is*Down`/`get*`), **per-frame edge tracking** (`justPressed*`/`justReleased*` + `was*` + `endInputStateFrame`), and real **gamepad semantics** (dead zones, W3C button/axis naming, mapping-kind). Pointer payloads are now enriched (pressure/tilt/ twist/size), events are timestamped, coalesced events and pointer-lock/capture wrappers exist, and an `InputTextData` type replaced the prior `TextSelectionRange` overload. 40 exported functions, 40 `describe` blocks, 84 `it` tests — every export colocated-tested. The score is held below "authoritative" by three deferred-by-design items: no `InputBackend` seam (web-only host coupling), no action/binding or gesture layer, and no gamepad rumble — each correctly parked on an open design fork rather than guessed at.

The status doc's claims (second-pass APIs, types, test counts, design rationales) **verify against the diff and source**: the new types exist with the documented shapes, every new function is present with the described behavior, and the noted smells (`void options`, eager signal fold, `connectSignal` returning `void`) are real in the source.

## Present capabilities

**Device normalization (attach/detach pairs, one internal binding registry).** Keyboard (`attachKeyboardInput`/`detach…`), pointer (`attachPointerInput` over Pointer Events + contextmenu suppression), relative pointer (`attachRelativePointerInput` → `onPointerMoveRelative` from `movementX/Y`), wheel (`attachWheelInput`, `deltaMode`→`MouseWheelMode`), gamepad (`attachGamepadInput` with internal rAF poll + standalone `pollGamepadInput`), text/IME (`attachTextInput` over `beforeinput`+`compositionupdate`). Teardown is tracked in side `WeakMap`s (`_inputBindings`, `_gamepadPollStates`) keyed manager→target→kind, so re-attach is idempotent and callers hold nothing.

**Normalization primitives.** `getKeyCodeFromDomKeyboardEvent` (with numpad-by-location disambiguation and a char-code fallback), `getKeyModifierFromDomKeyboardEvent` (L/R-distinguished bitmask + CapsLock/NumLock), `getMouseWheelModeFromDomWheelEvent`. The key-code tables expanded this pass to F13–F24, browser/media/system keys, and `NumpadEqual`.

**Queryable state (new).** `createInputState` + `connectInputStateToInputManager` maintain a held-state snapshot; `isInputKeyDown`, `isInputPointerButtonDown`, `isInputGamepadButtonDown`, `getInputGamepadAxis` poll it. Pointer buttons are a per-`pointerId` bitmask; gamepad axes/buttons use a compact `gamepad * MAX_GAMEPAD_{AXES,BUTTONS} + index` encoding (32/64 caps documented at the head of the file).

**Frame-edge tracking (new).** `InputState` carries four `Set<number>` edge sets; the connect handlers maintain them, `was*Pressed`/`was*Released` query them, and `endInputStateFrame` rolls them — the canonical "just-pressed-this-frame" game-loop surface. Connect/disconnect handlers clear stale per-pad state across all caps.

**Gamepad semantics (new).** `applyGamepadAxisDeadZone` (linear rescale) and `applyGamepadStickDeadZone` (radial, alias-safe out-param) match SDL/Unity-grade behavior; `getGamepadButtonName`/`getGamepadAxisName` resolve W3C standard indices to `GamepadButtonKind`/`GamepadAxisKind` via fixed tables; `GamepadMappingKind` (`'standard' | 'raw' | ''`) is threaded through `InputGamepadConnectData` on connect/disconnect so callers know whether the semantic names apply.

**Pointer/pen depth (new).** `setInputPointerData` now populates `pressure`, `tiltX/Y`, `twist`, `width/height`, `isPrimary`, `pointerId`, and `timeStamp`; `getCoalescedInputPointerEvents` iterates `getCoalescedEvents()` (single-event jsdom fallback) reusing one scratch payload; `requestInputPointerLock`/`exitInputPointerLock`/`hasInputPointerLock` and `setInputPointerCapture`/`releaseInputPointerCapture` wrap the lock/capture APIs with sentinel/no-throw semantics.

**Key-repeat synthesis (new).** `createInputKeyRepeatTimer({delay, interval})` returns a reusable `{start, stop}` handle for non-DOM sources (d-pad, virtual keys, native backends).

**Engineering quality.** Zero per-event allocation (scratch `_*Data` singletons), `Readonly<>` on all signal payloads and read-only params, `enabled` gate honored on every handler, `preventDefault` opt-out via `AttachInputOptions`, no import-time side effects, `"sideEffects": false`, single root barrel (`export * from './inputManager'`). Deps are exactly `@flighthq/signals` + `@flighthq/types`, both `*`-pinned, no phantom or `@flighthq/sdk` edges.

## Gaps

Against a maximal input library (SDL input, Unity Input System, gainput, OpenFL/Lime):

- **No `InputBackend` seam.** Every `attach*` takes a DOM `EventTarget`/`HTMLElement`/`Window` directly; a native host cannot feed normalized input through the same API without a parallel path. This is the single structural gap keeping "portable" (the package's own description) implicit rather than enforced. Correctly deferred — it is a design fork that reshapes every `attach*` signature and the Rust mirror (see Candidate open directions).
- **No action / binding map.** No `InputAction`, action sets, rebinding, chord/combo recognition. Status parks this as a `@flighthq/input-bindings` neighbor pending a name/boundary decision.
- **No gestures.** Tap, double-tap, long-press, swipe/pan (velocity), pinch-zoom, rotate — none. Raw multi-touch pointers are exposed, but no recognizer sits on top. The Bronze timestamps + Silver coalesced-events preconditions are now both met, so the only blocker is the package-shape decision (`@flighthq/gestures`).
- **No gamepad rumble/vibration** (`GamepadHapticActuator`). Status correctly blocks this on the backend seam (native rumble must route through a backend).
- **No gamepad mapping database.** Only the W3C `'standard'` mapping is named; `'raw'`/`''` devices get no semantic names. An SDL `GameControllerDB`-style `@flighthq/gamepad-mappings` is the deferred plurality case (≥2 mapping sources → registry).
- **No multi-device identity / hot-plug beyond gamepads.** No `InputDeviceId` or generalized `onInputDeviceConnect`/`Disconnect` for keyboard/mouse — relevant for native hosts with multiple keyboards/mice.
- **Internal field-population drift.** `attachRelativePointerInput` hand-assigns all 14 `_pointerData` fields instead of routing through `setInputPointerData`, a parallel codepath that can silently drift from the canonical one (flagged in the API alignment review).

## Charter contradictions

The charter is a **stub** (only "What it is" is seeded; North star, Boundaries, Decisions, Open directions are all `TODO`). There is therefore no stated North-star principle, Boundary, or Decision for the code to contradict — **none found.** The package is judged below against the codebase-map AAA standard, and every assumption I had to make is surfaced as a candidate open direction. The "portable, backend-agnostic representation" phrase in "What it is" is _aspirational_ against today's DOM-coupled `attach*` signatures, but absent a blessed Boundary that is a gap, not a contradiction.

## Contract & docs fit

**Lives up to the contract — strongly.**

- **Types-first.** Every cross-package type (`InputState`, `InputTextData`, `InputKeyRepeatOptions`, `GamepadAxisKind`/`GamepadButtonKind`/`GamepadMappingKind`, the `InputGamepad*Data` set) is defined in `@flighthq/types`, one concept per file, and implemented against. The only inline interface (`GamepadPollState`) is module-internal and never crosses a boundary — correct.
- **Full unabbreviated names, `get*`/`is*`/`was*`/`has*` prefixes, `attach*`/`detach*` source-wiring pairs, `create*` allocation verb** — all clean (corroborated by the API alignment review).
- **Out-params alias-safe.** `applyGamepadStickDeadZone` reads `x`/`y` into the magnitude before writing `out`; the `setInput*Data` helpers read every event field before writing `out`.
- **Sentinels, not throws.** Disabled managers short-circuit; missing `navigator.getGamepads` falls back; unknown keys → `KeyCode.UNKNOWN`; `getGamepad*Name` return `null` off-standard/out-of-range; pointer-lock/capture wrappers no-throw.
- **Single root export, `sideEffects: false`, no top-level side effects** — verified.
- **Symbol kinds used correctly.** `kGamepadInput` etc. are internal-only `Symbol()` slot keys, never serialized — the permitted symbol case.

**Candidate contract / admin-doc revisions (user's gate, not mine):**

- **Package Map line is now stale.** `@flighthq/index.md` still describes input as "maps raw system inputs to a normalized internal representation, feeding into interactions, signals, and other consumers" — it does not mention the now-substantial **state-snapshot + frame-edge query surface** (`InputState`, `is*Down`, `was*`) or **gamepad semantics**. The `package.json` `description` ("…keyboard, pointer, wheel, and text events") omits **gamepad** entirely. Both undersell the package's current scope.
- **`enable*`-signals convention departure.** `createInputManager` eagerly folds in all 15 signals via `...createInputSignals()`; there is no `enableInputSignals` opt-in seam. The codebase map makes signal-group cost opt-in (`enableDisplayObjectSignals`). Defensible here — signals are this package's _sole_ delivery mechanism, so a manager without them is inert — but it is an undocumented departure from a stated convention. Worth either a blessed Decision ("input signals are not opt-in because they are the delivery mechanism") or a per-group `enable*` split.
- **TS↔Rust conformance-map drift.** The crate's native push-dispatch family (`dispatch_keyboard_event`, the 12 `dispatch_*` fns, `dispose_input_manager`, `poll_gamepad_snapshots`) has **no TS counterpart** and is only implicitly covered by the conformance map's "DOM input wiring" phrase — which does **not** name `input`. `poll_gamepad_input` is a Rust no-op stub. These belong in the divergence map explicitly (flagged by the ts-rust alignment review).
- **`GamepadMappingKind` as a closed union.** It is a `*Kind` name but a closed string union (`'standard' | 'raw' | ''`), not an object-constant registry like its `GamepadButtonKind`/ `GamepadAxisKind` siblings. Defensible (the W3C mapping-state set is genuinely fixed/bounded), but it reads inconsistently against the kind-as-string-constant convention. A naming/shape question for the types-layout doc, not a bug.

## Candidate open directions

The charter is silent on all of the below; each is something a reviewer or worker must currently _assume_. These feed the charter's Open directions for the user to settle.

1. **Is `@flighthq/input` a normalization seam or a full game-input library?** The depth review framed it as a deliberately thin normalization layer; this pass added state, edges, and gamepad semantics that push it toward "library." The charter must state the intended scope — it decides whether the gaps above are missing-by-design or missing-by-omission.
2. **The `InputBackend` seam (fork D — runtime backend seam).** Do `attach*` keep DOM-target signatures alongside a backend path, or route entirely through a `*Backend`? This is the gate for native hosts, gamepad rumble, multi-device identity, and Rust parity. The single highest-leverage undecided question.
3. **Neighbor-package boundaries.** Bless or reject `@flighthq/input-bindings` (action/binding maps), `@flighthq/gestures` (recognizers — preconditions now met), and `@flighthq/gamepad-mappings` (the `GameControllerDB` plurality case). Each is a subject-triad / new-cell decision (bedrock test), not a within-package sweep.
4. **Boundary with `@flighthq/sensors` and the platform event-suite.** Where do accelerometer/ gyroscope/orientation and on-screen-keyboard events live relative to `input`? Status surfaces this as unresolved.
5. **Signal-cost model.** Settle the `enableInputSignals` question above as a blessed Decision either way, so the eager fold is documented intent rather than drift.
