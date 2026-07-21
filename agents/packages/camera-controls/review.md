---
package: '@flighthq/camera-controls'
status: solid
score: 78
updated: 2026-07-21
ingested:
  - source
  - tests
---

# camera-controls — Review

## Verdict

**Solid — 78/100.** The package is a small set of input-agnostic intent and framing primitives over
the unified camera package. Orbit, fly, and 2D follow remain separate; applications map device input
into their verbs and explicitly update a camera. It does not own an event loop, a renderer, or input.

The bedrock state seams are complete enough to compose: controller products are Entities;
copy/clone/reset/snap make current/goal coupling explicit; angular smoothing crosses the ±π seam by
the shortest arc; world-up and actual view-plane pans have distinct operations; and sphere framing
uses the active viewport aspect without hiding near/far policy. Advanced camera behaviors still need
a charter direction rather than accumulating into one controller union.

## What is solid

- Orbit has distinct current and goal azimuth/polar/distance, explicit clamps, dolly/orbit and two
  honest pan bases, frame-rate-independent shortest-arc damping, and one camera-writing update.
- Fly has distinct current and goal yaw/pitch, level forward/right movement, explicit world-up
  motion, pitch clamps, shortest-arc damping, and one camera-writing update.
- Controller constructors and clone products are Entities. Copy leaves the destination runtime
  untouched and mutable position/target vectors are never shared.
- Reset synchronizes all coupled state from defaults or a seed; snap synchronizes current to clamped
  goals without also writing the camera.
- Framing keeps its effects legible: perspective changes orbit goal distance, orthographic changes
  projection half-extents, both copy the sphere center, and neither rewrites clip planes.
- 2D follow exports deadzone, damping, and world-bounds clamping from this package. Package metadata
  names that real export rather than implying a removed `camera2d` package.
- Dependencies remain limited to camera, entity, geometry, math, and types; the package is
  side-effect-free and headless-testable.

## Gaps and ambiguities

- The charter is still a stub. Arcball/trackball semantics, rail/cinematic ownership, additive shake,
  and collision-query shape require a direction session before implementation.
- Perspective framing deliberately does not adjust near/far planes. A later composition may offer an
  explicit clip-range proposal, but it must not silently mutate camera depth precision.
- Framing accepts a sphere rather than an oriented view-space box. Box-tight framing can be a separate
  utility if real consumers need less conservative placement.

## Domain ceiling

Input bindings stay adapters outside the controller core. Collision-aware fly motion consumes a
caller query rather than importing physics. Shake is an additive pose modifier; rails consume path or
animation primitives. These cuts preserve discernible atoms and avoid a universal modeful controller.
