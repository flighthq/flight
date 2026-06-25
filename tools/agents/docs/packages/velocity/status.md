---
package: '@flighthq/velocity'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# velocity — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Ran the Recommended sweep against the live `packages/velocity/src/`. The assessment's single Recommended item — tighten `getVelocitySampleAt`'s `currentWorldTransform` parameter from an inline structural literal to `Readonly<Matrix>` in `affineVelocity.ts` — is **not actionable against the current source**: that file and symbol do not exist in the live worktree.

The current source exports only 8 functions across `transformVelocity.ts` and `velocityField.ts` (`contributeTransformVelocity`, `beginVelocityFrame`, `contributeVelocity`, `createVelocityField`, `ensureVelocitySample`, `getVelocity`, `hasVelocity`, `suppressVelocity`). There is no `affineVelocity.ts`, no `getVelocitySampleAt`, no `contributeAffineVelocity`, and no inline structural `Matrix` literal parameter anywhere in `src/`. The assessment was built from the `builder-67dc46d64` head (23 exports, `affineVelocity.ts` present, see the entry below), which the live tree does not reflect — the package was reduced/restructured after the assessment was authored.

- **Done:** nothing — no Recommended item maps to the current source.
- **Parked:** the `getVelocitySampleAt` `Readonly<Matrix>` tightening — the target file/symbol does not exist in the live worktree; re-deriving it would require re-authoring `affineVelocity.ts`, a design decision out of sweep scope.
- **Tests:** `npm run test --workspace=packages/velocity` — 2 files, 11 tests, all pass. No edits made.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/velocity

**Session date:** 2026-06-24 **Previous score:** 72/100 (solid) **Estimated new score:** 91/100 (Gold)

---

## Implemented APIs

### New exported functions (23 total, up from 8)

**Affine velocity (`affineVelocity.ts`):**

- `contributeAffineVelocity(field, root)` — the package's own unfinished promise from the depth review. Walks a Transform2DNode subtree using `previousWorldTransform` for per-pixel-correct velocity on rotating/scaling nodes. Equivalent to `contributeTransformVelocity` for translate-only nodes, but correct for the full affine case.
- `getVelocitySampleAt(sample, currentWorldTransform, pointX, pointY, out)` — computes `current·p − previous·p` at an arbitrary local-space point. Enables per-pixel velocity buffer writes from fragment shaders; returns zero when no previous transform is stored.

**Value algebra (`velocityField.ts`, new functions):**

- `addVelocity(out, a, b)` — `out = a + b`, alias-safe
- `clampVelocity(out, velocity, maxLength)` — clamp to max blur length, alias-safe
- `copyVelocity(out, source)` — copy x/y, alias-safe
- `dampVelocity(out, current, previous, factor)` — exponential moving average for jitter-free buffers, alias-safe
- `isVelocityZero(velocity, epsilon?)` — predicate for skipping velocity-buffer writes
- `lengthOfVelocity(velocity)` — scalar magnitude
- `lerpVelocity(out, a, b, t)` — linear interpolation, alias-safe
- `normalizeVelocity(out, source)` — unit vector, zero-safe, alias-safe
- `scaleVelocity(out, velocity, scale)` — pixel-ratio / unit conversion, alias-safe
- `subtractVelocity(out, a, b)` — `out = a - b`, alias-safe
- `zeroVelocity(out)` — set both components to zero

**Angular velocity:**

- `contributeAngularVelocity(field, source, radians)` — first-class angular contribution (radians/frame); stored in addition to linear velocity; explicit this frame
- `getAngularVelocity(field, source)` — reads angular velocity; returns 0 for stale/missing

**Time normalization:**

- `beginVelocityFrame(field, dt?)` — extended to accept optional `dt`; defaults to 1 (frame-locked)
- `getVelocityPerSecond(field, source, out)` — divides per-frame velocity by `dt`; returns per-frame value when `dt=1`

### Type changes in `@flighthq/types/Velocity.ts`

- `VelocitySample.angularVelocity: number` added (initialized to 0, stale-fenced same as linear velocity)
- `VelocityField.dt: number` added (initialized to 1 by `createVelocityField`)
- Fixed stale doc comment in `VelocityContributor`: changed `contributeNodeVelocity / suppressNodeVelocity` to `contributeVelocity / suppressVelocity`
- Added explicit missing-by-design notes documenting: per-frame delta (not per-second by default), single previous frame, per-instance velocity punted to kind's velocity writer

### Tests

- `affineVelocity.test.ts` — new file, 9 tests covering `contributeAffineVelocity` and `getVelocitySampleAt` (zero-on-first-frame, translation delta, explicit override, previousWorldTransform update, affine reprojection at non-origin points, rotation correctness, alias safety)
- `velocityField.test.ts` — extended from 8 to 52 tests covering every new export with alias-safe cases

**Test count:** 61 tests, 3 test files, all passing.

---

## Deferred items and why

### Cross-package: Package Map entry

The depth review noted `@flighthq/velocity` is absent from `tools/agents/docs/index.md`. Adding a Package Map entry was deferred because the instruction is to not reach across package boundaries autonomously — the Package Map is in a root-level doc that is effectively shared infrastructure. **Suggestion:** add the following entry to the Package Map under the rendering/effects area:

> `@flighthq/velocity`: generic per-node velocity-field seam between motion sources (transform delta, tween, physics, camera, manual edit) and GPU motion-blur velocity-buffer writers (`displayobject-gl`/`-wgpu` `*Velocity` writers, `effects-gl`/`-wgpu` motion blur). Consumers: `contributeAffineVelocity` or `contributeTransformVelocity` once per frame, then read via `getVelocity` or `getVelocitySampleAt`.

### Cross-package: GL/Wgpu velocity writer adoption of affine reprojection

The GL and Wgpu velocity writers in `displayobject-gl`/`displayobject-wgpu` currently consume only translation delta. Switching them to call `getVelocitySampleAt` would be the payoff of the affine work, but touches other packages. Surface as a suggestion for a cross-package session.

### Cross-package: Transform-trait hardening

`contributeTransformVelocity` and `contributeAffineVelocity` both cast children `as unknown as Transform2DNode` because `HierarchyNode` does not carry the transform trait. The cleanest fix (a trait check `isTransform2DNode` or a typed child accessor in `@flighthq/node`) lives outside this package. Deferred as a cross-package suggestion.

### Silver: Bulk iteration / `forEachVelocity`

The depth review noted there is no way to enumerate all moving sources this frame. The cleanest solution requires switching `samples` from `WeakMap` to a hybrid (a live-this-frame list plus `WeakMap` retain semantics), which changes the GC/ownership story. This is a genuine design decision: the current `WeakMap` keying is credited as a strength by the depth review. Deferred — **surface as a design decision to the user** before implementing. The hybrid approach (keep `WeakMap` for ownership, add an aux array cleared each `beginVelocityFrame`) would work but changes the memory model.

### Silver: `VelocityWriteParams` / buffer-write convention helper

Centralizing the screen→buffer scale + Y-axis convention that GL and Wgpu writers each bake in would require coordinating adoption across those packages. Deferred as a cross-package alignment item. Worth defining the descriptor in `@flighthq/types` and surfacing to the relevant teams.

### Silver: Velocity field signals

`enableVelocityFieldSignals` (frame-begun, source-suppressed) was not implemented — no real consumer appears yet. Deferred with that explicit reasoning.

### Gold: Multi-frame history / VelocityHistory

An optional ring of N previous transforms per sample (`enableVelocityHistory(field, frames)`) for trail effects and TAA-style temporal reprojection. Large addition; changes field/sample shape. Deferred as a large explicit opt-in feature that changes the allocation model.

### Gold: Acceleration

`VelocitySample.acceleration: Velocity2D` plus `contributeAcceleration` / `getAcceleration` derived from the velocity delta across frames. Deferred; adds another tracking field per sample.

### Gold: Rust parity

`flighthq-velocity` already mirrors the 8-function baseline. The new 15 additions (affine reprojection, value algebra, angular velocity, dt, `getVelocityPerSecond`) should be mirrored in the crate. The `WeakMap<object>` → `HashMap<u64>` keying divergence should be recorded in the conformance divergence map. Deferred — Rust work is scoped to the `rust` worktree.

### Gold: Functional conformance scene

A `tests/functional/velocity-*` scene exercising translation, rotation, and scale motion blur across the raster backends. Deferred — requires the GL/Wgpu writers to adopt `getVelocitySampleAt` first (cross-package).

---

## Concerns and surprises

- **`contributeAffineVelocity` origin-space velocity**: The function derives velocity from the delta of the node's own origin (0,0 in local space) using the world transform. This is geometrically correct for the common case (the origin represents the node's position), but a node with a non-zero `pivotX/pivotY` has its origin at a different point. The `getVelocitySampleAt` function is the right tool when a specific point is needed; the contributor's origin-space velocity is the natural "where did this node's anchor move" answer. This is the same behavior as `contributeTransformVelocity` (which uses `tx/ty` directly) — so there is no regression, but it is worth documenting.

- **The `VelocitySample` field order was changed** (alphabetized: `angularVelocity`, `explicitFrameId`, `lastFrameId`, `previousWorldTransform`, `velocity`) per the codebase style. This is a non-breaking change since all access is by name.

- **`beginVelocityFrame` optional `dt` parameter**: The parameter is `dt?: number` (optional), defaulting to `1` in the body. This keeps backward compatibility — existing callers with no `dt` argument continue to work correctly, and `getVelocityPerSecond` is a no-op (returns same as `getVelocity`) when `dt=1`. This is a clean zero-breaking-change addition.

- **`contributeAngularVelocity` sets both `lastFrameId` and `explicitFrameId`**: This means calling `contributeAngularVelocity` also blocks `contributeTransformVelocity` from overwriting the linear velocity. This matches the semantic of "I explicitly contributed this source this frame." If a caller wants angular velocity without blocking the linear baseline, they need to set `angularVelocity` directly on the sample. Worth documenting in a future session; for now the explicit-wins-over-baseline fence is consistent.

---

## Suggestions for future sessions

1. **Adopt `contributeAffineVelocity` in `displayobject-gl` and `displayobject-wgpu`** — the payoff of this session's biggest addition. The GL/Wgpu writers currently read only `velocity.x/y`; switching to `getVelocitySampleAt` for nodes with rotation/scale would produce correct motion blur at rotating pivots.

2. **Add Package Map entry** for `@flighthq/velocity` in `tools/agents/docs/index.md` (one-line addition, appropriate for a doc-only session or alongside a cross-package session).

3. **Decide on bulk iteration** (`forEachVelocity`) — should `VelocityField` add a live-this-frame iteration list? Surface the `WeakMap` vs hybrid tradeoff to the team before implementing.

4. **Rust parity pass** — mirror the 15 new functions into `flighthq-velocity` in the `rust` worktree and record the `WeakMap<object>` vs `HashMap<u64>` divergence in the conformance map.

5. **Multi-frame history** (`enableVelocityHistory`) — when TAA or N-frame motion trails become a real consumer need, this is the next addition. Gate it behind an explicit opt-in so the common case stays allocation-light.
