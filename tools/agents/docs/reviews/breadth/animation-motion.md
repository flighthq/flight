# Breadth Review: Animation & Motion Designer

**Lens:** I build rich animated and motion-graphics experiences, so I judge whether the package set covers the full motion toolbox — tweening, easing, timelines/keyframes, spritesheet & cel animation, MovieClip playback, sequencing/staggering, springs, velocity/physics-driven motion, and time control.

**Coverage: 72/100**

## What a complete SDK owes this perspective

- A property **tween** engine with per-property easing, delay, repeat, yoyo, callbacks, and the ability to tween colors and transforms.
- A complete **easing** library — the full Penner set (sine/quad/cubic/quart/quint/expo/circ/back/elastic/bounce) in In/Out/InOut plus linear, steps, and custom cubic-bezier.
- **Timeline / keyframe** sequencing: keyframes with labels, gotoAndPlay/Stop, frame events, frame-rate control.
- **MovieClip-style** playback for hand-authored, frame-based content.
- **Spritesheet / cel animation**: frame data, named animations, a player, and importers for the formats designers actually export (Aseprite, TexturePacker, Starling).
- **Sequencing & staggering**: chaining tweens, parallel groups, staggered offsets across a collection — the single most-used motion-design primitive after the basic tween.
- **Spring / physics-based motion**: critically-damped springs and inertia/decay, now the default "natural" motion model in modern UI.
- **Velocity / motion-vector** awareness for motion blur and physics-driven follow.
- **Time control**: pause/resume, time scaling, per-manager clocks, and a frame-driven update loop.
- **Particles** as a motion subsystem (emitters, curves, forces).
- **Motion paths**: animating an object along an authored path with orientation-to-tangent.
- **Skeletal / bone animation** (Spine, DragonBones) — the dominant 2D character-animation pipeline.

## Well covered

- **Easing** is excellent and canonical: the full Penner family in In/Out/InOut, smoothstep/smootherstep, steps, and `easeCubicBezier`. Nothing meaningful is missing here.
- **Tween** has a solid spine: `createTween`/`applyTween` with a `NumericProps` property map, `createColorTween`, a `TweenManager` with `updateTweens(deltaTime)`, and full lifecycle control (pause/resume/stop/reset/complete) at tween, target, and manager scope. `createTweenTimer` covers delayed callbacks.
- **Timeline + MovieClip** is real and OpenFL-faithful: `createTimeline`/`createMovieClip`, `gotoAndPlay`/`gotoAndStop`, `next/prevFrame`, `findTimelineLabel`, current/total frame queries, signals, and a `createSpritesheetTimelineSource` bridge so timelines can drive spritesheet frames.
- **Spritesheet / cel animation** is genuinely AAA in breadth: frame and animation data, a player (`createSpritesheetPlayer`, `updateSpritesheetPlayer`, `queueSpritesheetAnimation`), build-from-tileset, and a `particles-formats`-style `spritesheet-formats` with **Aseprite, TexturePacker, and Starling** parse + serialize. This is exactly what a designer's export pipeline needs.
- **Particles** is deep and motion-aware: keyframe-driven scalar and color curves (`buildParticleCurve`, `sampleParticleColorCurve`, `…FromKeyframes`/`…ToKeyframes`), forces, collisions, prewarm, burst, and importers for Particle Designer / Spine / Unity. As a motion subsystem it is well stocked.
- **Velocity** as a first-class package (`velocity` + per-backend velocity writers/targets in `displayobject-gl/-wgpu` and velocity textures in `effects-gl/-wgpu`) is a pleasant surprise — it means motion blur and velocity-driven effects are a designed seam, not an afterthought. Few SDKs expose this.

## Gaps & missing capabilities

- **No tween sequencing / staggering / parallel composition.** `tween` exposes only individual tweens and a timer — there is no `createTweenSequence`, `createTweenGroup`/parallel, chaining, or stagger helper. This is the most-reached-for motion-design tool after the basic tween (GSAP timelines, anime.js stagger). Today a designer must hand-roll sequencing with timers and callbacks. This is the single biggest hole.
- **No spring / inertia motion model.** There is no spring tween, critically-damped spring solver, or decay/inertia helper anywhere (confirmed: no `spring*` exports across all 86 packages). Spring physics is now the default "natural" feel for UI motion; its absence is conspicuous next to the otherwise-complete easing set. `velocity` measures motion but does not drive it.
- **No skeletal / bone animation runtime.** There is a Spine _particle_ importer, but no skeletal/bone/IK runtime (no `bone`, `skeleton`, or `morph` exports). For 2D character motion graphics this is the largest _category_ gap — Spine/DragonBones playback is a core expectation for this perspective.
- **No motion-path / path-following animation.** `path` exists for geometry and `getVector2AngleBetween` exists, but there is no "animate along a path with orient-to-tangent" helper bridging `path` and `tween`/`timeline`. Motion graphics lean on this heavily.
- **No morph / shape-tween / vertex-interpolation.** OpenFL-target parity implies shape tweening; nothing interpolates path/shape geometry between keyframes.
- **Time control is thin.** Tweens advance via `updateTweens(deltaTime)`, but there is no exposed time-scale / global slow-motion knob on the manager, and no shared animation clock unifying tween, timeline, spritesheet, and particles under one time domain. Each subsystem has its own update call with no orchestrator.
- **No unified "animation player" / state-machine layer.** Spritesheet, timeline, and tween each play independently; there is no blend-tree or animation-state-machine concept to cross-fade between named animations (an Animator-style layer). For richer character/UI motion this is increasingly expected.

## Missing or too-thin packages I would expect

- **`@flighthq/skeleton`** (or `@flighthq/spine`) — skeletal/bone animation runtime with IK, skinning, and a Spine/DragonBones importer. The biggest missing motion category. The existing `particles-formats` Spine importer shows the import muscle exists; the runtime does not.
- **`@flighthq/spring`** — critically-damped spring solver + decay/inertia, usable standalone and as a tween driver. Small, value-typed, and would slot cleanly beside `easing`.
- **Tween sequencing in `@flighthq/tween`** (not a new package): `createTweenSequence`, parallel groups, `staggerTweens`, and chaining/onComplete-then. This is an enrichment of an existing thin package rather than a missing one.
- **`@flighthq/motion-path`** (or motion-path helpers folded into `tween`) — animate a `Transform2DNode` along a `Path` with orient-to-tangent and arc-length parameterization. Bridges `path` + `tween`.
- **`@flighthq/clock`** (or a time-control surface on the managers) — a shared, scalable animation clock so tween/timeline/spritesheet/particles can run under one pausable, time-scaled domain. Without it, global slow-motion / scrubbing across subsystems is per-system bespoke.
- **Shape/morph tweening** — likely a function set in `shape`/`path` + `tween` rather than its own package, but currently absent and implied by OpenFL parity.

## Verdict

The fundamentals are strong and well-architected: easing is complete and canonical, MovieClip/timeline is faithful to the OpenFL target, the spritesheet/cel pipeline (with real exporter importers) is the standout, particles is deep, and velocity-as-a-package is forward-looking. The set clearly _hangs together_ for frame-based and particle-driven motion.

What holds it back from a designer's "complete toolbox" is the **procedural-motion composition layer**: there is no tween sequencing/staggering, no spring/inertia model, no skeletal animation, and no motion-path or unified time-control. These are not edge cases — sequencing, springs, and Spine playback are everyday tools in modern motion design. The good news is that most gaps are enrichments of existing thin packages (`tween`, `path`) or small value-typed neighbors (`spring`, `skeleton`, `clock`) that fit the cellular architecture cleanly. Closing the tween-sequencing and spring gaps alone would move this from "solid but frame-centric" to genuinely complete.
