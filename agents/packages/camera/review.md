---
package: '@flighthq/camera'
status: solid
score: 82
updated: 2026-07-21
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# camera — Review

## Verdict

**Solid — 82/100.** The live package is now the unified camera math domain. It contains Entity-backed
Camera3D, perspective and orthographic projection, view/view-projection/inverse matrices, basis vectors,
frustum/culling/corners, linear depth, world/screen rays, plane/sphere queries, directional-shadow
framing, plus Camera2D view/projection/follow/zoom/parallax/visible-bounds behavior. Eighty-two unit tests
cover the family. Camera controls correctly live in the neighboring camera-controls package.

The largest current defect is migration completeness rather than missing math: dozens of Flight
functional scenes still import the removed Camera/createCamera/setCameraViewMatrix4FromLookAt names.
The constructor invariant is also only half-realized—Camera3D is an Entity, while Camera2D and both
projection create functions return structural objects.

## What is solid

- Camera3D has one canonical world-to-view Matrix4 and a discriminated projection descriptor; it does
  not duplicate a scene-node transform.
- Draw/query matrix operations take an explicit aspect, enabling one camera to serve multiple Viewports.
  The stored perspective aspect remains a useful headless/default authoring value.
- Projection/unprojection, basis, frustum, culling, depth, and intersection helpers are small,
  allocation-conscious functions over shared geometry primitives.
- Camera2D is in the same package and supplies matrix, point conversion, follow/dead-zone, zoom-at-point,
  parallax, and visible-bounds primitives without preserving a separate camera2d package boundary.
- Shadow-camera configuration is a composition helper, not a shadow renderer.

## Gaps and drift

- Camera2D does not extend Entity and createCamera2D returns a literal, unlike Camera3D.
- createOrthographicProjection and createPerspectiveProjection return non-Entity descriptors. Under the
  repository-wide create invariant they must either become Entity values or use a non-create descriptor
  vocabulary.
- Functional scenes and comments still refer to removed Camera APIs; the migration is broad enough that
  unit/package checks can pass while build:functional fails.
- Camera2D stores viewportWidth/viewportHeight. A single Camera2D reused across multiple render views
  needs either explicit per-query Viewport dimensions or a clearly documented authored-default plus
  draw-time override, parallel to Camera3D aspect.
- No off-axis/asymmetric frustum, stereo view family, reversed-Z/infinite-far projection, oblique clip
  plane, or temporal jitter sequence generator. These are later projection primitives, not reasons to
  grow a universal camera object.
- Several operations use module scratch and are non-reentrant; this is documented inconsistently across
  the package.

## Architectural conclusion

The package boundary is now correct. Keep camera as pure projection/view/query math, camera-controls as
intent/state drivers, Viewport as the draw-time surface region, and scene nodes optional. The next work
is contract completion and functional migration, then additive projection models.
