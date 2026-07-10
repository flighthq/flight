---
package: '@flighthq/flow'
crate: flighthq-flow
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# flow — Charter

## What it is

`@flighthq/flow` is the **application mode/screen flow stack** — a stack of application states (boot, menu, play, pause, game-over) with an enter/exit/pause/resume/update lifecycle, so an app transitions cleanly between modes and layers overlays (a pause menu over a frozen screen, an inventory over a live one). It is the small orchestration primitive every engine has (Phaser scenes, a Unity/MonoGame state stack): push a state to enter it, pop to return, replace to swap, and the stack drives the right lifecycle callbacks on each transition. It generalizes beyond games to any application's top-level mode machine.

It is flow control, not save data — this is the *screen/mode* stack. Serializable save/load state is a separate concern, not this package.

## North star

The complete flow-state stack: push / pop / replace / clear with correct paired lifecycle (`onEnter`/`onExit`, `onPause`/`onResume`), an `update` pass that ticks the active state (and transparent overlays' underlying states when they opt in), transparency flags (update-below / render-below) for overlays, and active-state queries — everything an application's top-level mode machine needs, as a plain-data stack + small functions with direct lifecycle callbacks.

## Boundaries

- **Depends on `@flighthq/types`** (and optionally `@flighthq/signals` only if transition *events* are added later — the first build uses direct callbacks). No display, no renderer, no scene graph.
- **Orchestration, not content.** A `FlowState`'s actual update/draw is the caller's code, invoked through the state's lifecycle callbacks; flow owns the stack, the transitions, and which states are active/paused. It renders nothing and holds no scene graph.
- **Not save/serialization.** Persisting/restoring application data is out of scope; this is the runtime mode stack.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] A stack, with direct lifecycle callbacks.** `FlowState = { onEnter?; onExit?; onPause?; onResume?; onUpdate?; updateBelow?; renderBelow? }` (all optional; `updateBelow`/`renderBelow` mark an overlay that lets the state under it keep updating/being visible). Lifecycle is **direct callbacks**, not signals — a state's transitions have a single owner (the stack) and must fire deterministically in a defined order, which is exactly when the SDK prefers direct callbacks over loose signal dispatch.
- **[2026-07-10] Transition semantics are fixed and paired.** `pushFlowState(stack, state)` → the current top `onPause`, the new state `onEnter`. `popFlowState(stack)` → top `onExit`, the revealed state `onResume`. `replaceFlowState(stack, state)` → top `onExit`, new `onEnter` (no pause/resume of the one below). `clearFlowStack` → `onExit` top-to-bottom. `updateFlowStack(stack, deltaTime)` ticks the top's `onUpdate`, then walks downward through any `updateBelow` overlays to tick the states beneath. Queries: `getActiveFlowState`, `getFlowStackDepth`, and a helper to enumerate the render-visible states (top + contiguous `renderBelow`).
- **[2026-07-10] Plain-data `FlowState`/`FlowStack` in `@flighthq/types`.** Header owns the shapes; functions carry the `FlowState`/`FlowStack` names.

## Open directions

1. **Transition signals.** An opt-in `enableFlowStackSignals` emitting push/pop/replace events for observers (analytics, transition effects) — over the direct-callback core.
2. **Async transitions.** Awaiting an `onEnter` that loads assets before the state becomes active (a loading gate) — composes with `@flighthq/assets`/`@flighthq/loader`.
3. **Transition effects.** A cross-fade/slide between states — a rendering-layer follow-on, not core flow.
