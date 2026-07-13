---
package: '@flighthq/flow'
status: solid
score: 78
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# flow — Review

## Verdict

solid — 78/100. The charter's North star is fully built: every transition with its paired lifecycle, the transparency-aware update walk, the render-visible enumeration, and the queries — as a plain-data stack with direct callbacks, depending on `@flighthq/types` alone. The domain is deliberately small, and this package covers it; what it lacks is the layer around the edges (reentrancy safety during lifecycle callbacks, guards) and the three chartered follow-ons (signals, async transitions, transition effects).

## Present capabilities

One exported function per file, matching the 2026-07-10 decisions exactly:

- **Types** (`packages/types/src/Flow.ts`): `FlowState { name?, onEnter?, onExit?, onPause?, onResume?, onUpdate?, updateBelow?, renderBelow? }` (all optional; `name` documented as debugging-only) and `FlowStack { states }` (top = last).
- **Lifecycle transitions** — `pushFlowState` (previous top `onPause` → push → `onEnter`), `popFlowState` (top `onExit` → revealed `onResume`; returns the popped state or `null` sentinel on an empty stack), `replaceFlowState` (top `onExit` → new `onEnter`, explicitly no pause/resume of the state below — documented rationale), `clearFlowStack` (`onExit` top-to-bottom, no pause/resume — teardown, not layering).
- **Update walk** — `updateFlowStack(stack, deltaTime)`: top always ticks; each visited state with `updateBelow` also ticks the one beneath, chain-stopping at the first opaque state.
- **Visibility** — `getFlowStackVisibleStates(stack, out)`: out-array (cleared first) filled bottom-to-top with the top plus its contiguous `renderBelow` run.
- **Queries** — `getActiveFlowState` (`null` sentinel when empty), `getFlowStackDepth`.
- **Hygiene** — `createFlowStack` is the only allocating function (documented); deps = `types` only; `sideEffects: false`; 28 tests across 9 colocated files.

## Gaps

Measured against mature state-stack implementations (Phaser scene manager, MonoGame/libGDX screen stacks):

- **Reentrant transitions are undefined** — a lifecycle callback that itself pushes/pops/replaces (e.g. `onEnter` immediately pushing a loading overlay, `onUpdate` popping on death) mutates `states` mid-transition. Nothing tests or documents what happens; mature stacks either defer transitions to the next update or define the order. Today the behavior is whatever the array mutation yields.
- **No guard layer** — no `enableFlowGuards`; e.g. re-pushing a state already on the stack (its callbacks then fire in confusing pairs) or transitioning during a transition warns nowhere.
- **No named navigation** — `name` exists on `FlowState` but nothing consumes it (no lookup, no pop-to-name unwind). Debug-only today per the type comment; multi-level unwinds ("return to menu from three overlays deep") need repeated pops.
- **Chartered follow-ons unbuilt** — transition signals (`enableFlowStackSignals`), async/awaitable transitions (loading gates), and transition effects: charter Open directions 1–3.
- **`updateBelow` passes the same `deltaTime` down** — no provision for a paused-but-updating overlay to scale time below it; arguably composition with `@flighthq/clock` covers this (each state ticks its own clock), but nothing documents the pattern.

## Charter contradictions

None. All three 2026-07-10 decisions hold precisely, including the direct-callbacks-not-signals rule and the pop/replace pause-resume pairings. Boundaries (no display/renderer/scene-graph, not save data) are respected — deps are `types` alone.

## Contract & docs fit

- **Contract**: clean — full `FlowState`/`FlowStack` names, out-array with clear-first semantics, `null`/no-op sentinels not throws, one export per file, single root barrel.
- **Docs**: the Package Map line matches the built shape function-for-function (it even documents the replace and visible-states semantics accurately). No stale claims.

## Candidate open directions

- **Reentrancy policy** — immediate (documented order) vs deferred transitions (queue applied after the current callback/update). This is the one real semantic hole; either answer is defensible, and it should be a charter ruling, not an implementation accident.
- **Named unwind** — whether `popFlowState`-to-name (`popFlowStackToName`-style) is in scope, or `name` stays debug-only.
- **Clock composition** — the blessed pattern for time-scaled overlays (per-state `Clock` vs a deltaTime transform in `updateBelow`), worth one documented example when clock adoption sweeps consumers.
