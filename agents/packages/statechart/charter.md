---
package: '@flighthq/statechart'
crate: flighthq-statechart
draft: false
lastDirection: 2026-08-04
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# statechart — Charter

## What it is

`@flighthq/statechart` is the plain-data concurrent finite-state-machine primitive shared by gameplay and visual-authoring runtimes such as Rive. An immutable `Statechart` describes typed inputs, independent regions, states, guarded transitions, exit-time requirements, and blend durations. A mutable `StatechartInstance` holds one actor's input values, active state per region, elapsed state time, transition, and reported blend weight, so one authored chart can drive any number of actors without copying descriptor data.

This is not `@flighthq/flow`. Flow is a covering LIFO screen/mode stack with direct lifecycle closures: push, pop, pause, resume. A statechart is a graph of serializable data with guarded edges, concurrent regions, typed inputs, and reported transition progress. Extending either package to impersonate the other would erase the boundary that makes both small.

## North star

- **Serializable authored graphs, mutable actor instances.** `Statechart`, its regions, states, inputs, conditions, and transitions are immutable shareable descriptions with zero callbacks. All running values live on `StatechartInstance`.
- **Concurrency is fundamental.** Every explicit advance visits every region against the same input snapshot. Regions are independent rather than covering; a trigger stays latched until the entire pass has seen it.
- **Data-only transitions.** Boolean, Number, and Trigger inputs feed an authored all-conditions guard. Transitions are checked in authored order, state changes are reported as a count or through opt-in signals, and no `onEnter`/`onExit` closure is stored in chart data.
- **Blending is reported, never performed.** Each region publishes a plain target-state weight while a transition runs. The package knows no animation clip, scene node, renderer, or consumer; the composition layer decides what the weight blends.
- **State kinds are an open registry key.** `Statechart.Atomic` and `Statechart.Nested` seed the vocabulary, while vendor-prefixed strings extend it without editing a central union. The flat core does not switch on kinds, so a flat gameplay chart pays no nested-runtime cost.

## Boundaries

**In scope:**

- Immutable `Statechart` descriptors and mutable, typed-array-backed `StatechartInstance` actors.
- Concurrent region stepping, typed input writes, data-only comparison guards, trigger latching, transition timing, blend reporting, sentinel queries, and shakeable explanations.
- Open state-kind keys for nested and vendor-specific composition layers.
- Opt-in `StatechartSignals` on the mutable instance. A bare count/read consumer never allocates signal state, and authored chart data never contains a closure.

**Out of scope:**

- Animation sampling or blending, Rive-specific state payloads, display objects, scene graphs, and rendering.
- Screen/mode stacking and direct lifecycle callbacks (`@flighthq/flow`).
- Importing Rive or any other authoring format (`@flighthq/scene2d-formats` and its codecs).
- A built-in nested-state interpreter. `Statechart.Nested` is an open dispatch key so the composition that owns nested payloads supplies that behavior without taxing the flat core.

**Dependencies:** `@flighthq/types` for the header, `@flighthq/signals` only for the separately tree-shakeable opt-in observer module, and `@flighthq/log` only for the separately tree-shakeable guard module. No animation, scene, geometry, renderer, or format dependency. A count/read-only consumer carries bytes from neither opt-in dependency.

### Primitive-number / composition-meaning convention

**A primitive and its composition layer exchange plain numbers in both directions, and neither knows what the other means.** Outbound, `skeleton2d` publishes bone world matrices as a flat `Float32Array`, and `statechart` publishes a region blend weight without knowing whether it mixes animations, audio, poses, or application values. Inbound, the composition layer hands statechart a state duration through `setStatechartRegionDuration`; statechart divides elapsed time by it without knowing whether it came from an animation, a timer, or another state runtime. Data does not need to flow only one way. The dependency boundary stays clean because the numbers carry no high-level semantics across it.

### Query-vs-write package-placement test

**Writing coordinates needs the type; querying geometry needs the kernel.** A component that merely writes coordinates into an authored/runtime value should depend only on the free header type in `@flighthq/types`. A component that measures, intersects, flattens, samples, or otherwise queries geometry needs the owning kernel and declares that real dependency. This test keeps a coordinate producer such as `skeleton2d` from depending on `@flighthq/path`, and it applies equally when deciding whether statechart core needs a higher-level composition package: publishing a weight does not require knowing how that weight is consumed.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-04] A distinct package from `flow`.** User-directed: statechart is the graph/concurrency/input/guard/blend substrate for gameplay FSMs and Rive state machines; flow remains the closure-bearing application screen stack and is unchanged.
- **[2026-08-04] Immutable chart plus mutable instance.** One shareable descriptor owns inputs and concurrent regions. Per-actor typed arrays own input values, active states, active transitions, elapsed time, and blend progress.
- **[2026-08-04] Zero callbacks in authored state data.** Entry/exit are observed by `advanceStatechartInstance`'s changed-region count followed by state queries, or by the separately tree-shakeable `enableStatechartSignals` path. The optional signal group lives only on the mutable instance.
- **[2026-08-04] Triggers clear after the whole concurrent pass.** `fireStatechartTrigger` latches numeric 1. Every region observes the same latch during the next `advanceStatechartInstance`, after which all Trigger inputs clear to 0. A transition condition on a Trigger ignores its authored comparison and value.
- **[2026-08-04] State kinds and composition meanings stay open.** The core seeds `Statechart.Atomic` / `Statechart.Nested` but never switches on them. Custom kinds are vendor-prefixed registry keys. Blend is a plain number interpreted above this package.
- **[2026-08-04] Query-vs-write decides dependency placement.** Writing a value requires only its header type; querying a domain requires its kernel. Statechart reports scalar state and depends on no animation/scene composition package.
- **[2026-08-04] Exit-time denominator is supplied by composition.** `StatechartInstance.regionElapsed` accumulates the milliseconds passed to `advanceStatechartInstance`; composition writes `regionDuration` through `setStatechartRegionDuration` when a region enters a state; the exit gate is `regionElapsed / regionDuration >= exitTimeRatio`. Core resets elapsed and duration on entry. A zero/unset duration is caller error but coerces to no requirement so core never divides by zero; `explainStatechartTransition` reports `MissingRegionDuration`, and `enableStatechartGuards` warns through the separately tree-shakeable diagnostics tier.

## Open directions

1. **Nested-state composition contract.** The `Statechart.Nested` registry key is reserved now; a future composition package should define the nested descriptor/handler shape only when a real Rive or gameplay consumer proves it, without adding a closed kind switch to the flat core.
2. **Transition interruption policy.** The first build completes an active blend before evaluating a new edge. Interruptible/priority transitions should be added only with an authored contract that defines source/target blend ownership and deterministic ordering.
