# Geometry f64 at Authoring, f32 at GPU

_2026-11-18. Architecture record — spatial coordinates use f64 precision at the authoring layer; f32 is reserved for GPU submission and bounded/normalized values._

**Status: RATIFIED 2026-11-18.**

## Decision

All geometry types in `flight-geometry` (`Vector2`, `Vector3`, `Vector4`, `Matrix`, `Matrix3`, `Matrix4`, `Quaternion`, `Rectangle`, `Capsule`, `OBB`, `AABB`, `Ray3D`, `Frustum`, `BoundingSphere`, `Transform2D`, `Transform3D`, `Plane`) change their scalar fields from `f32` to `f64`. Every crate that operates on spatial coordinates follows: collision, path, layout, physics, scene graph transforms, skeleton, interaction, picking, camera, velocity.

GPU submission stays `f32`. The conversion boundary is `prepareScene2DRender` / `prepareScene3DRender`, where world-space f64 transforms become GPU-ready f32 vertex/uniform data.

## Boundary rule

**f64 — spatial:** Any value that represents a position, distance, size, angle, or transform in world or local coordinate space. This includes geometry primitives, scene graph transforms, collision volumes, path control points, layout positions, bone transforms, physics positions and velocities.

**f64 — time:** Any value that represents elapsed time, duration, or a time delta in seconds. Time accumulates unboundedly — f32 loses sub-millisecond precision after ~2 hours. `flight-clock`, `flight-timeline`, and `flight-movieclip` already use f64 for time with lint-allow annotations explaining this. Tween and animation durations, elapsed times, and delta-time params follow.

**f64 — animated values:** Any value that stores or interpolates a quantity that may be a spatial coordinate. Tween target values (`to`, `start`, `change`), spring value/velocity/target fields, and animation keyframe sample buffers must match the precision of the fields they write into. A tween animating `position.x` must carry f64 to avoid narrowing the f64 coordinate back to f32 through the animation system.

**f32 — bounded/normalized:** Easing functions (0–1 → 0–1 input/output), interpolation progress/weight (0–1), color channels (0–1), opacity, blend weights, audio sample data, GPU vertex attributes, texture coordinates, uniform floats.

The test: *can this value grow unboundedly, or does it write into a field that can?* f64. *Is it inherently bounded and never stored into a spatial or time field?* f32.

## Rationale

1. **TypeScript parity.** JS `Number` is f64. The TS geometry types are already f64. The Rust IR's f32 was a narrowing that created a precision mismatch — the IR should match the authoring model.

2. **Large-world precision.** f32 has ~7 significant digits. At world coordinates of 100,000 units (a large game map), sub-unit precision drops to ~0.01. f64 has ~16 significant digits — sub-unit precision at any realistic world scale.

3. **Prior art.** Unreal Engine 5 migrated FVector from float to double (LargeWorldCoordinates) at enormous cost post-launch. Three.js, PixiJS, Flash — all use f64 at the authoring layer. Flight does it pre-launch with zero migration cost.

4. **Downstream consumers.** openfl-flight needs f64 for Flash `Number` compatibility.

5. **flight-path validates the direction.** `flight-path` already uses f64 with 208 lint-allow annotations overriding the f32 convention. Those annotations go away.

## Lint convention

The current lint prohibits `f64` without explicit `// flight-lint: allow(f64)` justification. After this change:

- `f64` is the default for spatial values — no annotation needed.
- `f32` in a spatial context requires justification (e.g., GPU submission).
- The 208 `allow(f64)` annotations in `flight-path` are removed.
- Bounded/normalized `f32` (color, easing, audio) needs no annotation — it was always correct.

## Crate classification

Audited 2026-11-18. Line counts are f32-bearing source lines (not tests).

### Tier 1: Core — mechanical f32→f64, no triage

| Crate | f32 lines | Notes |
|-------|----------:|-------|
| `flight-geometry` | 616 | All type definitions, constructors, operations |
| `flight-math` | 88 | DEG_TO_RAD, EPSILON, PI, clamp/lerp/saturate |

### Tier 2a: Pure spatial — f32→f64 for all values

| Crate | f32 lines | Notes |
|-------|----------:|-------|
| `flight-collision` | 1,211 | GJK/EPA distances, normals, support points |
| `flight-path` | 244 | Already f64 with 208 lint-allows — those go away |
| `flight-physics2d` | 575 | Forces, torques, positions, velocities, joints |
| `flight-physics3d` | 820 | Angular impulse, force, positions |
| `flight-layout` | 100 | top/bottom/left/right/width/height |
| `flight-textlayout` | 92 | width/height, ascent/descent metrics |
| `flight-text` | 96 | width/height bounds, glyph positions |
| `flight-textshaper` | 26 | Advance widths, caret positions |
| `flight-skeleton2d` | 135 | Bone length, rotation, scale, vertex deform |
| `flight-camera` | 124 | Frustum, aspect, projection |
| `flight-lighting` | 157 | Light positions, directions, cone angles |
| `flight-node` | 78 | pivot, rotation, scale, skew, position |
| `flight-velocity` | 20 | Velocity x/y, sample points |
| `flight-picking` | 30 | Distance, point coords, barycentric |
| `flight-interaction` | 61 | Hit test x/y, coord_scale |
| `flight-clip` | 15 | Clip region bounds (already uses f64, casts go away) |

### Tier 2b: Mixed spatial/time/animated-value + bounded — line-by-line triage

| Crate | f32 lines | →f64 | Stays f32 |
|-------|----------:|------|-----------|
| `flight-tween` | 72 | duration, delay, elapsed (time); to, start, change, `get` accessor (animated values) | progress, eased_t (0–1 weight) |
| `flight-spring` | 118 | delta_time (time); value_x/y/z, velocity_x/y/z, target_x/y/z (animated values) | — |
| `flight-animation` | 181 | time, dt, duration, elapsed (time); keyframe sample `Vec` / `&mut [f32]` (animated values) | alpha, weight (0–1 blend) |
| `flight-particles` | 310 | Positions, velocities (spatial) | lifetime ratio (0–1), color r/g/b/a |
| `flight-particleemitter` | 182 | Transforms, velocities, positions_z (spatial) | `alphas`, `colors` |
| `flight-shape` | 71 | Path geometry coordinates (spatial) | `alpha`, morph `time` (0–1) |
| `flight-scene2d` | 14 | width/height (spatial) | `alpha` |
| `flight-scene3d` | 32 | Transforms (spatial) | `alpha` |

Note: `flight-clock`, `flight-timeline`, `flight-movieclip` already use f64 for time — no changes needed. Their lint-allow annotations go away with the convention flip.

### Tier 3: Stays f32 — no changes

| Crate | f32 lines | Reason |
|-------|----------:|--------|
| `flight-easing` | 108 | Purely `fn(f32) -> f32` on 0–1 range |
| `flight-bitmap` | 287 | Pixel color values |
| `flight-color` | — | Color channels |
| `flight-audio` | — | Sample data |
| `flight-mesh` | — | Vertex buffer data (GPU-ready) |
| `flight-texture` | 26 | UV coordinates, anisotropy |
| `flight-render-gl` / `-wgpu` | — | GPU vertex data, uniforms |
| `flight-scene2d-gl` / `-wgpu` / `-canvas` / `-dom` | — | GPU submission |
| `flight-scene3d-gl` / `-wgpu` | — | GPU submission |
| `flight-effects-gl` / `-wgpu` / `-canvas` | — | GPU shader params |

### Tier 4: Render boundary — the conversion seam

| Crate | f32 lines | Notes |
|-------|----------:|-------|
| `flight-render` | 54 | `prepareScene2DRender`/`prepareScene3DRender` gains `as f32` casts |

## FFI impact

The FFI generator maps Rust types mechanically. `f32` params/returns become `f64` automatically — `float` → `double` in the C header. Zero manual generator changes. The in-flight FFI tasks (K/L/M) are unaffected: they change generator logic, not type mappings.

## Implementation sequence

Tier 1 first (geometry + math), then Tier 2 crates in parallel, then Tier 4 (render boundary). Tier 3 is no-op. Each tier's work is independent once the tier below it lands.
