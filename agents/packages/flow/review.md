---
package: '@flighthq/flow'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# flow — Review

## Verdict

solid — 80/100. The charter's North star is fully implemented: every transition verb with its paired lifecycle semantics, the transparency-aware update walk, the render-visible enumeration, and the stack queries — all as a plain-data stack with direct callbacks, depending on `@flighthq/types` alone. Since the prior review (2026-07-13), structural refactors consolidated per-verb files into concept files and introduced proper contract lanes, improving packaging hygiene without changing functional behavior. The domain is deliberately small and fully covered; the remaining distance to 100 is the guard layer, reentrancy characterization, and the three chartered follow-ons.

## Present capabilities

Source is a single implementation file (`packages/flow/src/flow.ts`, 110 lines) and its colocated test (`flow.test.ts`, 288 lines, 28 tests, all passing), plus the two-lane entry points.

### Types (`packages/types/src/Flow.ts`)

`FlowState` — `{ name?, onEnter?, onExit?, onPause?, onResume?, onUpdate?(deltaTime), updateBelow?, renderBelow? }` (all optional; `name` documented as debugging-only, no behavioral role). `FlowStack` — `{ states: FlowState[] }` (top = last element). Both exported from `@flighthq/types` at `.` and `./contract`.

### Lifecycle transitions (`flow.ts`)

- `pushFlowState(stack, state)` — previous top `onPause` then new state `onEnter`.
- `popFlowState(stack)` — top `onExit` then revealed `onResume`; returns the popped state or `null` sentinel on an empty stack.
- `replaceFlowState(stack, state)` — top `onExit` then new `onEnter`; explicitly no pause/resume of the state below (documented rationale in the function comment).
- `clearFlowStack(stack)` — `onExit` top-to-bottom; no pause/resume (teardown, not layering).

### Update walk

`updateFlowStack(stack, deltaTime)` — the active top always ticks; each visited state with `updateBelow` also ticks the one beneath, chain-stopping at the first opaque state (no `updateBelow`). No-op on an empty stack.

### Visibility query

`getFlowStackVisibleStates(stack, out)` — fills the `out` array (cleared first) bottom-to-top with the top plus the contiguous `renderBelow` run beneath it. The caller draws index 0 first (front-to-back).

### Stack queries

`getActiveFlowState(stack)` — the top or `null` sentinel. `getFlowStackDepth(stack)` — count of states.

### Allocation

`createFlowStack()` — the only allocating function. Every other function mutates or queries in place.

### Packaging

- Two-lane exports: `index.ts` (cultivated public lane, explicitly listing all 9 functions) and `contract.ts` (`export * from './flow'`). Public and contract lanes currently expose the same 9 functions, appropriate for a package this small.
- `sideEffects: false` declared.
- Single dependency: `@flighthq/types`.
- Intra-SDK imports use `@flighthq/types/contract` correctly.
- Re-exported through `@flighthq/sdk` (both `.` and `./contract`, plus `game.ts` domain barrel).

## Gaps

Measured against mature state-stack implementations (Phaser scene manager, MonoGame/libGDX screen stacks, Godot SceneTree push/pop):

- **Reentrant transitions are undefined** — a lifecycle callback that itself pushes/pops/replaces (e.g. `onEnter` immediately pushing a loading overlay, `onUpdate` popping on death) mutates `states` mid-iteration. No test characterizes the resulting behavior; no guard warns. Mature stacks either defer transitions to a queue applied after the current callback, or define and test the immediate-mutation order. Today the behavior is whatever the array mutation yields, which is an implementation accident, not a design choice.
- **No guard layer** — no `enableFlowGuards` module. Missing diagnostics: re-pushing a state already on the stack (its callbacks fire in confusing duplicate pairs), transitioning during another transition's callback, and popping an empty stack (currently a silent `null` return, correct as a sentinel, but the guard could warn in development). The diagnostics convention requires a shakeable guard module over `@flighthq/log`; none exists.
- **No named navigation** — `name` exists on `FlowState` but nothing consumes it. No lookup-by-name, no pop-to-name unwind. Multi-level unwinds ("return to menu from three overlays deep") require repeated manual pops.
- **Chartered follow-ons unbuilt** — Open direction 1 (transition signals via `enableFlowStackSignals`), Open direction 2 (async transitions / loading gates composing with `@flighthq/assets`/`@flighthq/loader`), and Open direction 3 (transition effects / cross-fade). All three are acknowledged as follow-ons, not omissions.
- **`updateBelow` passes the same `deltaTime` down the chain** — no provision for a paused-but-updating overlay to time-scale the state beneath it. The composition pattern (each state ticking its own `@flighthq/clock`) is undocumented.

## Charter contradictions

None. All three 2026-07-10 decisions hold precisely:

1. The stack with direct lifecycle callbacks, not signals — confirmed by source and the absence of any `@flighthq/signals` dependency.
2. Transition semantics are fixed and paired — `pushFlowState`/`popFlowState`/`replaceFlowState`/`clearFlowStack`/`updateFlowStack` match the charter's specification, including the `replaceFlowState` no-pause/resume rule and the `clearFlowStack` top-to-bottom exit order.
3. Plain-data `FlowState`/`FlowStack` in `@flighthq/types` — confirmed at `packages/types/src/Flow.ts`, exported from both lanes, functions carry the full type names.

Boundaries are respected: no display, no renderer, no scene graph dependency; not save/serialization.

## Contract & docs fit

### Package against contract

- **Types-first**: types live in `@flighthq/types` — clean.
- **Full unabbreviated names**: every function includes `FlowStack` or `FlowState` in full — clean.
- **Out-parameter**: `getFlowStackVisibleStates` uses `out: FlowState[]` with clear-first semantics — clean.
- **Sentinels not throws**: `popFlowState` returns `null` on empty, `clearFlowStack`/`updateFlowStack` no-op on empty — clean.
- **Two-lane exports**: `.` and `./contract` both present — clean. Public lane is explicitly cultivated (named re-exports, not `export *`).
- **`sideEffects: false`**: declared — clean.
- **No module-level side effects**: no top-level registration, no globals — clean.
- **`Readonly<T>` usage**: `pushFlowState` and `replaceFlowState` take `state` as `Readonly<FlowState>` (the state is not mutated). `getActiveFlowState`, `getFlowStackDepth`, `getFlowStackVisibleStates`, and `updateFlowStack` take `stack` as `Readonly<FlowStack>` for read-only operations. `clearFlowStack`, `popFlowState`, `pushFlowState`, and `replaceFlowState` take mutable `FlowStack` since they mutate the stack — appropriate.
- **Loose module variables at bottom**: none (no module-level state) — clean.
- **Alphabetized exports**: yes, in both `flow.ts` and `index.ts`.
- **Commit messages**: all post-review commits follow the `type(scope): subject` format.

### Contract/docs against the package

- **Package Map line** (AGENTS.md): `flow` listed under "Game" domain — accurate match.
- **No stale claims** in the Package Map or feature lookup.
- **Prior review's claim of "one export per file"** is now stale after the concept-file consolidation. The current layout is one concept file (`flow.ts`) with all 9 functions, which is the correct shape for a bedrock package this small.

## Candidate open directions

- **Reentrancy policy** — the charter does not address whether transitions during callbacks are immediate (with a defined order) or deferred (queued and applied after the current callback/update completes). This is the one genuine semantic hole; either answer is defensible but should be a charter Decision, not an implementation accident.
- **Named unwind** — whether `name` should be promoted from a debug-only field to a navigation key enabling `popFlowStackToState`-style unwinding, or whether it stays debug-only. The charter's silence on this leaves the field's purpose ambiguous for consumers.
- **Clock composition** — the blessed pattern for time-scaled overlays (per-state `Clock` from `@flighthq/clock` vs. a deltaTime transform in the `updateBelow` chain) is undocumented and belongs as either a charter Boundary or a documented example.
