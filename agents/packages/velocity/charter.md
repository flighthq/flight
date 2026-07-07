---
package: '@flighthq/velocity'
crate: flighthq-velocity
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# velocity — Charter

## What it is

`@flighthq/velocity` is a **per-frame, per-object 2D motion tracking** primitive — a `VelocityField` backed by a `WeakMap` that any system (transform delta, tween, physics, camera move, manual edit) contributes screen-space velocity into, and any consumer (primarily GPU motion-blur velocity-buffer writers in `render-gl`/`render-wgpu`) reads out. It owns the velocity field data structure, the default transform-delta contributor, per-pixel affine sample reconstruction, and value-algebra utilities (add, clamp, damp, lerp, normalize, scale).

Small package, focused scope. The velocity field is the conduit between motion sources and post-processing effects.

## North star

1. **Fire-and-forget per-frame system.** Contributors write velocity; consumers read it. No manual lifecycle management — `WeakMap` keying gives automatic cleanup.
2. **Any motion is velocity for free.** The default contributor (`contributeTransformVelocity`) derives velocity from world-transform deltas. Tweens, physics, camera moves, and manual edits all produce velocity automatically.
3. **Per-pixel fidelity when needed.** `getVelocitySampleAt` reconstructs full affine (rotation + scale) motion at an arbitrary local-space point from the stored previous world transform. The stored velocity is origin-only; per-pixel quality comes from the sample function.
4. **Value-algebra utilities.** The velocity field provides `add`, `clamp`, `damp`, `lerp`, `normalize`, `scale`, `subtract` — composable, out-parameter, no-allocation operations on velocity values.

## Boundaries

**In scope:**

- `VelocityField` data structure (`WeakMap<object, VelocitySample>`).
- `beginVelocityFrame` — frame bookkeeping.
- `contributeTransformVelocity` — default subtree walker that derives velocity from world-transform deltas.
- `getVelocitySampleAt` — per-pixel affine velocity reconstruction from stored previous world transform.
- Explicit velocity overrides (`contributeVelocity`, `ensureVelocitySample`).
- Value-algebra: `addVelocity`, `clampVelocity`, `copyVelocity`, `dampVelocity`, `lerpVelocity`, `normalizeVelocity`, `scaleVelocity`, `subtractVelocity`, `zeroVelocity`.
- Queries: `getVelocity`, `hasVelocity`, `isVelocityZero`, `lengthOfVelocity`, `suppressVelocity`.

**Non-goals:**

- GPU velocity-buffer writing — `render-gl` / `render-wgpu` own the per-draw velocity texture production.
- Motion blur / post-processing effects — `@flighthq/effects`.
- Physics simulation — separate concern; physics contributes velocity, velocity doesn't simulate physics.

## Decisions

- **[2026-07-02] Remove `contributeAffineVelocity`.** It is identical to `contributeTransformVelocity` — both store `tx/ty` delta as velocity and copy the full world matrix to `previousWorldTransform`. The unique value is `getVelocitySampleAt`, which works with either contributor since both store the full matrix. Remove the duplicate; keep `getVelocitySampleAt`.

  **Why:** The review found the two contributors are behaviorally identical. The "affine" distinction was about the per-pixel sample function, not the contributor itself. One contributor + one sample function is clearer than two identical contributors.

- **[2026-07-02] `WeakMap` keying stays.** The velocity field is keyed by object identity via `WeakMap`. This gives automatic cleanup (no dispose path), no memory leaks from forgotten nodes. The consumer (motion-blur shader) walks the scene graph's render nodes and looks up velocity per-node — bulk iteration is never needed.

  **Why:** The use case doesn't need iteration. Automatic cleanup is the right default for a fire-and-forget per-frame system. No extra API surface for cleanup means better tree-shaking.

- **[2026-07-02] Tighten `getVelocitySampleAt` matrix parameter to `Readonly<Matrix>`.** The inline structural type should use the proper geometry type.

  **Why:** Type hygiene — use the SDK's own types, not ad-hoc structural matches.

- **[2026-07-02] Add Package Map entry for velocity.** Velocity is missing from the codebase map.

  **Why:** Every package should be navigable from the map.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Velocity's broader role.** Currently the primary consumer is motion blur. Could velocity serve physics, trails, interaction? The identity as a general motion-tracking primitive vs. a motion-blur enabler is undecided.

2. **3D velocity.** The current implementation is 2D (`Velocity2D`). If/when 3D scene rendering matures, velocity may need a 3D variant. The contributor is already typed on `Transform2DNode` — a 3D contributor would be a separate function.

3. **Transform trait hardening.** The `child as unknown as Transform2DNode` cast in the visitor is a type-level weakness. The fix lives in `@flighthq/node` (the hierarchy should carry the transform trait through children). Cross-package.
