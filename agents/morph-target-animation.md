---
feature: "morph-target animation"
draft: false
lastDirection: 2026-07-18
spans: ["@flighthq/types", "@flighthq/mesh", "@flighthq/scene", "@flighthq/animation", "@flighthq/scene-gl", "@flighthq/scene-wgpu", "@flighthq/scene-formats"]
---

# Morph-Target Animation — Charter

> **Blessed design of record; build deferred.** The architecture below is approved. No code has landed
> yet — this is the plan the work will follow when morph animation is scheduled. Until then,
> `importGltf`/`importMd2` deliberately emit empty animation (honest, not faked into TRS).

## What it is

Vertex-deformation animation driven by weighted **morph targets** (a.k.a. blend shapes / shape keys):
a base mesh plus a set of position/normal/tangent delta targets, blended each frame by a per-mesh
weight array that an animation channel drives. It is the **second deformer** in the SDK — the sibling
of skeletal skinning — and, like skinning, it is a geometry-deform variant a mesh gains by data, not a
new node kind.

The unifying idea (see [Architecture](#architecture)): an animation channel is always
`sampler → target`, and the only thing that varies is the *target path*. Flight has
`translation | rotation | scale` today (all drive a node's transform → fed to the skeletal deformer).
This feature adds `weights` (drives a per-mesh weight array → fed to a morph deformer). Same `Sampler`,
same clip, same animator, same clock — **only the sink differs**. This is exactly glTF's model
(`channel.target.path` already admits `"weights"`) and mirrors AwayJS's `VertexAnimator`/`VertexAnimationSet`
vs `SkeletonAnimator`/`SkeletonAnimationSet` split under one `AnimatorBase`.

## Why (primary consumers — in priority order)

This feature is **justified by glTF morph and authored blend shapes, not by MD2.** MD2 is the legacy
tail; it is the *validation case*, not the driver.

1. **glTF morph targets — the prize, and an existing gap.** glTF has first-class morph targets
   (`mesh.primitives[].targets`, per-mesh `weights`, and animation `channel.target.path = "weights"`).
   `@flighthq/scene-formats`'s `importGltf` **currently drops this twice**: `buildGltfAnimationClip`
   skips `weights` channels, and `primitiveToGeometry` never reads `primitives[].targets`. Facial
   animation, lip-sync/visemes, and expression blending ship in glTF constantly — this is mainstream,
   spec-native, and already half-specified in the importer.
2. **Authored blend-shape / facial animation as an engine feature.** Expressions, blinks, phonemes —
   a AAA character pipeline expects morph. Independent of any importer.
3. **Corrective / combined morph over skeletal.** High-quality characters run morph *on top of*
   skinning (corrective shapes firing with joint angles). The "two deformers, one animator" split is
   what makes skeletal+morph composition clean rather than a special case.
4. **Future FBX / COLLADA import.** Both carry blend shapes / morph controllers; FBX is the dominant
   facial-animation interchange. Same substrate when chartered.
5. **MD2 / MD3 (legacy) — the validation case.** Quake 2/3 vertex-frame animation. Least-used, but the
   proof that the *specialized-evaluator* branch (below) works end to end. If the substrate lights up
   glTF morph and blend shapes, MD2 falls out for free.

## North star

- One clip abstraction, one animator, one clock. The morph-vs-skeletal difference lives **only** in the
  deformer and, for MD2, a per-clip evaluator. It never infects the shared animation system.
- Morph is plain data: a target set on the mesh + a weight array; no hidden runtime behavior.
- `weights` is a first-class `SceneAnimationPath` alongside TRS — generic blend shapes and glTF morph
  animation ride the exact same channel/sampler/track machinery.
- MD2's oddities (absolute poses, normal LUT, quantization) are **quarantined in the MD2 importer**,
  never in the model.

## Architecture

Decouple *what is driven* (a weight array) from *how it deforms* (the deformer that reads the weights).

```
Animator (shared clock)
  ├─ TRS channels    → node graph      → skeletal deformer   (exists today)
  └─ weight/morph    → weight state     → morph deformer      (NEW)
                                            ├─ generic: additive blend shapes (base + Σ wᵢ·targetᵢ)
                                            └─ MD2: two-frame absolute lerp  (+ normal table, dequant)
```

- **Channel target path** is the single unifying seam. `weights` channels write into a per-mesh weight
  array; TRS channels write into node transforms. The `Sampler` (times + values + interpolation) and
  `AnimationTrack` are unchanged.
- **Deformer** is a new per-mesh concept: `none` (static) / `skeletal` (reads joint palettes — today's
  `mesh.skin`) / `morph` (reads a weight array + target set). Skinning becomes *a* deformer rather than
  a hardwired special case.
- **Two morph evaluators, one model.** The generic path is additive blend shapes. MD2 uses a
  *specialized* evaluator (recommended choice B below) that stores `{frameStart, frameEnd, fps}` and at
  time `t` computes the two active frame indices + blend factor directly — no hat-function weight tracks,
  no giant weight vectors. Both are morph deformers; only the evaluator differs.

### Why not fold MD2 into generic weight tracks (choice A, rejected)

You *can* express MD2 as glTF-style weight channels: precompute each frame as a delta from a base pose
and emit a `weights` track that is a hat function (`wᵢ = 1−t`, `wᵢ₊₁ = t`, all others 0). Elegant, one
code path — but it materializes a weight array sized to frame count with N−2 zeros at every instant.
For a ~198-frame Quake model that is wasteful. **Choose B (specialized morph-sequence evaluator) for
MD2, keep the generic `weights` path for real blend shapes.** Same abstraction, two evaluators.

### MD2 details that bite if missed

1. **Frames are absolute, not deltas.** The faithful, cheap deform is `lerp(posA, posB, blend)` — a
   *replace* blend, not additive. Only convert to deltas if routing through the additive path (A).
2. **Normals are indexed into MD2's fixed 162-entry table**, one index per vertex per frame. Lerp the
   *decoded* normals of the two frames and renormalize — never lerp the indices.
3. **Vertices are byte-quantized per frame** with a per-frame scale + translate. Dequantize at import
   into the base + frame poses; do not carry quantization into runtime.

## Boundaries

- **In scope:** a `weights` `SceneAnimationPath`; a morph-target set + weight array on `Mesh`; a
  deformer abstraction (`none`/`skeletal`/`morph`) in `@flighthq/scene`; the morph sink in
  `sceneAnimation.ts`; generic additive blend-shape evaluation; the MD2 specialized two-frame evaluator;
  CPU morph blend (and the GPU morph path in `scene-gl`/`scene-wgpu`); wiring `importGltf` to read
  `primitives[].targets` + `weights` channels, and `importMd2` to emit its morph sequence.
- **Non-goals:** skeletal skinning (exists); tween/timeline animation; a universal per-vertex animation
  cache format; runtime authoring of morph targets (import/build only). Retargeting morph across meshes
  is out — morph targets are mesh-local by construction.

## Per-package deltas (implementation map)

| Package | Change |
| --- | --- |
| `@flighthq/types` | Add `'weights'` to `SceneAnimationPath`; a `SceneAnimationTarget` variant (or sibling) that targets a mesh's weight array, not a node TRS; morph-target + weight-array fields on the `Mesh`/geometry types; a `MeshDeformer` tag (`none`/`skeletal`/`morph`). |
| `@flighthq/mesh` | Morph-target storage (base + per-target position/normal/tangent deltas) and the CPU blend that produces a deformed `MeshGeometry` from base + weights (sibling of `skinMeshGeometry`). |
| `@flighthq/scene` | The deformer abstraction; the morph sink in `sceneAnimation.ts` (`applyAnimationClipToScene` must route `weights` channels into the mesh weight array); the MD2 specialized evaluator hook. |
| `@flighthq/animation` | Likely nothing structural — `Sampler`/`AnimationTrack` already carry the curve. Confirm `weights` (variable-width value) samples cleanly. |
| `@flighthq/scene-gl` / `-wgpu` | GPU morph blend in the mesh shaders (or CPU-blend upload), beside the existing skinning path. |
| `@flighthq/scene-formats` | `importGltf`: read `primitives[].targets` + emit `weights` channels (close the double gap). `importMd2`: dequantize frames, build the morph sequence + normal-LUT decode, emit the specialized evaluator clip. |

## Decisions

- **2026-07-18 — Charter this as its own feature, not an MD2-importer tail.** Why: it reshapes
  `SceneAnimationPath`/`SceneAnimationTarget` and adds a deformer tier to `@flighthq/scene` —
  foundational animation surface that should be designed deliberately, not as a side effect of a format
  importer. Building it under the MD2 task would smuggle a cross-package design decision into a leaf.
- **2026-07-18 — glTF morph + blend shapes are the primary consumers; MD2 is validation.** Why: MD2 is
  legacy and minor; glTF morph is mainstream, spec-native, and already a gap in `importGltf`. Designing
  around glTF/blend-shapes makes the substrate pay for itself even if MD2 never ships.
- **2026-07-18 — Unify at the channel target path, split at the deformer.** Why: morph cannot become
  TRS (TRS drives a node transform; morph drives vertex positions). Unifying one level up keeps one
  animator/clock/clip and confines the difference to the sink — the AwayJS `VertexAnimator`/`SkeletonAnimator`
  precedent and glTF's own `weights` path.
- **2026-07-18 — MD2 uses a specialized two-frame evaluator (B), not generic weight tracks (A).** Why:
  the hat-function weight vector is O(frames) memory per instant for a format that is semantically a
  two-frame lerp; B matches source semantics and is cheaper. Keep the generic `weights` path for real
  blend shapes.
- **2026-07-18 — Until built, `importMd2` returns `{scene, [scene], animations: []}`.** Why: MD2's
  geometry/material/skin path is done and correct; its animation is honestly empty (not faked into TRS)
  until the substrate exists. Same for glTF morph — `importGltf` skips `weights` channels today by design,
  not oversight.

## Open directions

- **Combined skeletal + morph on one mesh.** Corrective morphs fire alongside skinning; a mesh may carry
  both a `skin` and a morph target set. Does the deformer abstraction compose two deformers, or is
  "skeletal+morph" a third deformer kind? (Lean: compose.)
- **GPU morph strategy.** Per-target vertex attributes vs a texture-packed target buffer vs CPU-blend-then-upload.
  Attribute slots are scarce; texture packing scales to many targets. Decide with `scene-gl`/`-wgpu`.
- **Sparse morph targets.** glTF morph targets are often sparse (only a face's vertices move). Reuse the
  glTF sparse-accessor path already in `scene-formats`, or a runtime sparse target representation?
- **Weight-array sampling width.** A `weights` track's value width = target count, which varies per mesh.
  Confirm `AnimationTrack.components` handles variable width, or whether weight channels need a distinct
  track shape.
- **MD2 normal fidelity vs cost.** Lerp-and-renormalize decoded normals is faithful; a cheaper option is
  to snap to the nearer frame's normal. Default to faithful; expose the cheap path only if measured.

## References

- glTF 2.0 morph targets: `mesh.primitives[].targets`, `mesh.weights`, animation `channel.target.path = "weights"`.
- AwayJS precedent: `VertexAnimator`/`VertexAnimationSet` vs `SkeletonAnimator`/`SkeletonAnimationSet` under `AnimatorBase`.
- [animation charter](packages/animation/charter.md) — the target-free core this rides on; morph is a
  new binding sink in `scene`, not a change to the animation core.
- [render-backend-support](render-backend-support.md) — where the GPU morph path's backend coverage will be recorded.
