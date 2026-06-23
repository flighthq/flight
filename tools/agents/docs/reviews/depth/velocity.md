# Depth Review: @flighthq/velocity

**Domain**: Per-frame, per-object 2D motion (velocity) tracking — a generic "velocity field" seam that any system (transform delta, tween, physics, camera, manual edit) contributes screen-space velocity into, and any consumer (primarily GPU motion-blur velocity-buffer writers) reads out. Its `package.json` description: "Generic per-node velocity field and contributors (transform-delta baseline + explicit overrides)."

**Verdict**: solid — 72/100

This package is deliberately a small seam, not a sprawling sub-library. Judged against what a velocity-field-for-motion-blur seam _should_ contain, it is close to complete and well-designed; the gaps are real but mostly are scope decisions that fit the SDK's "explicit, tree-shakable, free-function" style rather than omissions of canonical functionality. It is not in the documented Package Map (no `index.md` entry), so its intended scope is defined only by its own source and the `@flighthq/types` `Velocity.ts` contract.

## Present capabilities

Exported surface (8 functions):

- `createVelocityField()` — allocates the accumulator (`{ samples: WeakMap, frameId: 0 }`).
- `beginVelocityFrame(field)` — advances the frame counter; the staleness fence for the whole model.
- `contributeVelocity(field, source, x, y)` — explicit per-source contribution; marks both `lastFrameId` and `explicitFrameId` so explicit wins over the baseline regardless of call order.
- `suppressVelocity(field, source)` — zeroes a source this frame (teleport/cut so motion does not smear). Correct, canonical concept.
- `getVelocity(field, source, out)` — out-parameter read; returns zero for missing or stale (not-touched-this-frame) samples. Hot-loop-safe, no allocation.
- `hasVelocity(field, source)` — boolean predicate, also stale-aware and non-zero-aware.
- `ensureVelocitySample(field, source)` — get-or-create the per-source sample (shared with the contributor).
- `contributeTransformVelocity(field, root)` — the baseline contributor: walks a `Transform2DNode` subtree, derives each node's velocity from its world-transform translation delta vs. the previous frame, commits the new previous transform, and skips velocity-overwrite for nodes an explicit contributor already set this frame (via `explicitFrameId`).

Data model (in `@flighthq/types/Velocity.ts`): `Velocity2D {x,y}`, `VelocitySample {previousWorldTransform, velocity, lastFrameId, explicitFrameId}`, `VelocityField {samples, frameId}`, and an open `VelocityContributor` function-type contract so any system can be a contributor without depending on this package.

Strengths worth crediting:

- **Source-agnostic keying** — the field keys on any `object` (node, batch, custom entity), not only graph nodes, via a `WeakMap`. This is the right generality for the stated "velocity is not a camera feature" intent.
- **Explicit-overrides-baseline with order independence** — the `explicitFrameId` vs `frameId` fence is the genuinely tricky part of a contributor model and it is handled correctly and tested.
- **Stale-frame fencing** — reads return zero for samples not touched this frame, which is exactly what a per-frame velocity buffer needs.
- **`previousWorldTransform` retained**, not just translation, so a downstream producer can reproject per-pixel (`current·p − previous·p`) — the comment notes this even though the bundled contributor only fills translation delta.
- Test coverage mirrors every export (8 + 3 describe blocks, alphabetized).

## Gaps vs an authoritative motion/velocity library

The "authoritative" bar here is a velocity-buffer / motion-vector seam, not a physics integrator. Against that bar:

- **Translation-only baseline (the biggest real gap).** `contributeTransformVelocity` derives velocity purely from `world.tx/ty` deltas. A rotating or scaling node has zero translation delta at its origin yet its pixels move; correct motion blur for rotation/scale needs per-pixel `current·p − previous·p` reprojection. The data model _stores_ `previousWorldTransform` to enable this, but no function consumes it — the affine/per-pixel velocity path is designed-but-unbuilt. This is missing-by-omission relative to the model's own stated capability.
- **No angular/rotational velocity** as a first-class quantity. Many motion-blur and effect pipelines want a scalar angular velocity or a 2×2 transform-delta, not just a 2-vector. Missing-by-design is arguable, but the domain expects it.
- **No velocity smoothing / clamping / max-length helpers.** Production velocity buffers routinely clamp to a max blur length and optionally low-pass filter across frames to avoid jitter. None present (`clampVelocity`, `dampVelocity`, EMA). Missing-by-omission; small and canonical.
- **No pixel-ratio / unit-scaling helper.** Comments say "a producer scales by the render pixel ratio," but the package provides no `scaleVelocity` / unit-conversion helper — every consumer reimplements it.
- **No dt / time-normalization.** Velocity is per-frame delta, not per-second. A canonical library exposes both, or at least a `dt`-aware read. Missing; likely by-design (frame-locked buffers), but undocumented as a decision.
- **No batched/per-instance path here.** The `Velocity.ts` comment explicitly punts per-instance velocity to each kind's velocity writer (e.g. `displayobject-gl`/`-wgpu` `*Velocity` writers). This is a deliberate boundary, not an omission — call it missing-by-design.
- **No multi-frame history / trail.** Only one previous frame is kept. Higher-order (acceleration) or N-frame motion trails are absent — reasonable to exclude, but worth naming.
- **No bulk read / iteration.** There is no way to enumerate all moving sources this frame; consumers must already hold each source object. For a velocity-buffer producer that walks the scene anyway this is fine, but a standalone library would offer iteration.

## Naming / API-shape notes

- Naming is consistent with the SDK rules: full type words, `create*`/`begin*`/`contribute*`/`get*`/`has*`/`ensure*`/`suppress*` verbs all match house style; `getVelocity` uses an `out` parameter and is alias-safe by construction.
- **Internal naming drift in the contract.** `@flighthq/types/Velocity.ts` documents the `VelocityContributor` as writing "via contributeNodeVelocity / suppressNodeVelocity," but the actual exports are `contributeVelocity` / `suppressVelocity` (no `Node` infix). The doc comment is stale relative to the shipped names. Minor but should be reconciled.
- `contributeTransformVelocity` casts children to `Transform2DNode` (`child as unknown as ...`) because `HierarchyNode` does not carry the transform trait. The cast is commented and correct for homogeneous display/sprite graphs, but it is a soft spot — a non-transform child kind would be mis-typed.
- The package is **absent from the Package Map** in `tools/agents/docs/index.md`. For a package whose whole reason to exist is to be the shared seam between motion sources and GPU motion-blur writers, the missing map entry is a documentation gap that hides its scope and its relationship to `effects-gl`/`effects-wgpu` motion blur.

## Recommendation

Treat this as a **solid, intentionally-narrow seam** rather than a stub — it does its one job (per-frame explicit-vs-baseline velocity accumulation with correct staleness/override fencing) well and idiomatically. To reach AAA for its domain:

1. **Close the affine gap** — add a contributor (or upgrade the baseline) that uses the stored `previousWorldTransform` to produce per-pixel-correct velocity for rotation/scale, since the data model already pays for `previousWorldTransform`. This is the single most impactful addition and is the package's own unfinished promise.
2. Add small canonical value helpers: `clampVelocity` (max blur length), `scaleVelocity` (pixel-ratio / unit conversion), and optionally a per-frame damping/smoothing helper — all out-parameter, tree-shakable, and directly used by the motion-blur writers today.
3. Decide and document angular velocity: either expose it as a first-class quantity or record it as an explicit missing-by-design choice.
4. Add the Package Map entry and fix the stale `contributeNodeVelocity`/`suppressNodeVelocity` names in `types/Velocity.ts` so the contract matches the exports.
