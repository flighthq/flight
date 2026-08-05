---
package: "@flighthq/animation"
role: package
draft: false
lastDirection: 2026-08-02
crate: "flighthq-animation"
---

# animation — Charter

## What it is

Target-free animation core -- keyframe sampling, clip/channel bundling, playback control. Deliberately target-agnostic; domain binding layers (scene, sprite) interpret the results.

## North star

- Complete animation engine. Sampling, blending, events, state machines.
- Animation clips are pure data; playback is a stateless sample operation with explicit time input.
- Domain binding is external: scene applies clips to scene nodes, sprite applies them to frames. The core knows neither.

## Boundaries

- In scope: keyframe tracks (step/linear/cubic/slerp), clips, player, blending/crossfade, animation events/markers, additive animation, animation graph/state machine (long-term).
- Non-goals: display-object animation (timeline/movieclip), scene binding (scene's `applyAnimationClipToScene`), tweening (tween).

## Decisions

- **2026-07-03 — Keep as standalone package.** Why: significant build-out needed (blending, events, state machine). Bundling into scene would couple the animation engine to 3D; it should serve any target.
- **2026-07-03 — Blending/crossfade between clips in scope.** Why: crossfade is the minimum viable animation system for character animation; without it, transitions are discontinuous.
- **2026-07-03 — Animation events/markers/callbacks at specific times in scope.** Why: footstep sounds, VFX triggers, and gameplay events are standard animation features.
- **2026-07-03 — Animation graph / state machine in scope (long-term).** Why: state machines are the industry-standard way to manage complex animation transitions (walk/run/jump).
- **2026-07-03 — TS-leads, Rust conforms later.** Why: standard project posture.
- **2026-07-25 — State conditions stay external and transitions are imperative.** Why: gameplay already owns its parameters and conditions; explicitly requesting a named transition avoids a hidden predicate scheduler while the state machine still owns target correspondence, timing, and pose blending.
- **2026-07-25 — Blend trees are flat weighted player sets with ordered additive leaves.** Why: the irreducible operation is N-way per-target accumulation; hierarchy is composition by named state and shared players, without a recursive closed node union or implicit evaluator registry.
- **2026-07-25 — Partial-body masks are source-channel index subsets.** Why: channel indices are stable within each blend-tree/state-machine source and stay target-free; skeleton-specific joint masks remain a binding-layer concern. Ordered override/additive layers provide the composition policy.
- **2026-07-25 — Root motion extraction selects explicit channels and never applies them.** Why: translation and rotation commonly live in separate root channels; reusable extractors can accumulate either delta across unwrapped looped time while the binding/gameplay layer remains solely responsible for moving a node.
- **2026-07-25 — Events are sorted clip markers reported through the player's opt-in signal.** Why: markers are clip-time data, while crossing depends on player direction, repeats, and ping-pong traversal. Payload stays opaque and no timeline dependency is introduced.
- **2026-08-02 — MorphShape animation is a shape-owned binding over the unchanged target-free core.** Why: MorphShape progress is an ordinary scalar track sink. `@flighthq/shape` interprets its opaque target descriptor and exposes a reusable sample visitor; clips, players, crossfades, blend trees, state machines, and layer stacks remain free of shape knowledge.

## Open directions

None.
