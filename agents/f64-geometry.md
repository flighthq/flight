# Geometry f64 at Authoring, f32 at GPU

_2026-11-18. Architecture record — spatial coordinates use f64 precision at the authoring layer; f32 is reserved for GPU submission and bounded/normalized values._

**Status: RATIFIED 2026-11-18.**

## Decision

All geometry types in `flight-geometry` (`Vector2`, `Vector3`, `Vector4`, `Matrix`, `Matrix3`, `Matrix4`, `Quaternion`, `Rectangle`, `Capsule`, `OBB`, `AABB`, `Ray3D`, `Frustum`, `BoundingSphere`, `Transform2D`, `Transform3D`, `Plane`) change their scalar fields from `f32` to `f64`. Every crate that operates on spatial coordinates follows: collision, path, layout, physics, scene graph transforms, skeleton, interaction, picking, camera, velocity.

GPU submission stays `f32`. The conversion boundary is `prepareScene2DRender` / `prepareScene3DRender`, where world-space f64 transforms become GPU-ready f32 vertex/uniform data.

## Boundary rule

**f64 — spatial:** Any value that represents a position, distance, size, angle, or transform in world or local coordinate space. This includes geometry primitives, scene graph transforms, collision volumes, path control points, layout positions, bone transforms, physics positions and velocities.

**f32 — bounded/normalized:** Color channels (0–1), easing `t` parameters (0–1), blend weights, opacity, audio sample data, GPU vertex attributes, texture coordinates, uniform floats.

The test: *can this value grow unboundedly in world space?* f64. *Is it inherently bounded (a ratio, a weight, a normalized coordinate)?* f32.

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

### Tier 2b: Mixed spatial + bounded — line-by-line triage

| Crate | f32 lines | Spatial | Bounded (stays f32) |
|-------|----------:|---------|---------------------|
| `flight-shape` | 71 | Path geometry | `alpha`, morph `time` |
| `flight-particles` | 310 | Positions | `time`, color r/g/b/a |
| `flight-particleemitter` | 182 | Transforms, velocities, positions_z | `alphas`, `colors` |
| `flight-scene2d` | 14 | width/height | `alpha` |
| `flight-scene3d` | 32 | Transforms | `alpha` |
| `flight-animation` | 181 | — | Keyframe samples/weights, dt |
| `flight-spring` | 118 | 3D spring value x/y/z (if spatial) | 1D spring value/velocity |

### Tier 3: Stays f32 — no changes

| Crate | f32 lines | Reason |
|-------|----------:|--------|
| `flight-easing` | 108 | Normalized t values (0–1) |
| `flight-tween` | 72 | Interpolation weights, EasingFunction |
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
