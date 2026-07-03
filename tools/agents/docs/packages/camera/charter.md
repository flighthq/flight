---
package: '@flighthq/camera'
crate: flighthq-camera
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# camera — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

3D camera for the scene-render pipeline: projection descriptors (perspective / orthographic), view-matrix construction (`lookAt` / from-matrix), view-projection composition, and the derived geometry a real-time 3D app needs from a camera — screen↔world picking rays, world→screen projection, frustum extraction + culling predicates, frustum-corner reconstruction, eye/basis extraction, and linear-depth recovery.

The package owns camera **descriptors and composition**; it delegates all matrix, frustum, ray, and plane math to `@flighthq/geometry`, and defines its shared types (`Camera`, `Projection`, `Ray3D`, `Plane`, `Frustum`, `BoundingSphere`) in `@flighthq/types`. It ends where two neighbors begin: **photo / device capture** is `@flighthq/webcam` (not this package, despite the shared word "camera"), and **camera control** — orbit / fly / first-person rigs — is a future `@flighthq/camera-controller` neighbor, not here. Within the 3D family it sits beside `scene` / `mesh` / `lighting` / `texture` as the view-and-projection half of the pipeline.

## North star (proposed)

_Durable principles inferred from the design and the SDK-wide forks. Edit to your framing; nothing here is blessed._

- **Descriptors + composition here; math in geometry.** The camera holds plain data (projection descriptors, the camera entity) and composes view·projection; every matrix / frustum / ray / plane operation delegates to `@flighthq/geometry`. The camera never reimplements math geometry already owns.
- **Types in the header first.** `Camera`, `Projection`, and the math types it consumes (`Ray3D`, `Plane`, `Frustum`, `BoundingSphere`) live in `@flighthq/types`; the package implements against them. The full camera surface is navigable from the header alone.
- **Real-time picking/culling is the bar, not just matrices.** A camera here is one a 3D app can actually use — unproject, project, frustum culling, frustum corners, basis/eye, linear depth — not merely the matrix half that feeds post-process effects.
- **Explicit allocation, alias-safe out-params, sentinels on failure.** `create*` is the only allocator; every derive-into function reads all inputs before writing `out` and is alias-safe; non-invertible / behind-camera / parallel cases return `false`/sentinel, never throw.
- **1:1 conformance with `flighthq-camera`.** The Rust crate is a drop-in mirror; the TS surface is the authoritative spec the crate conforms to.

## Boundaries (proposed)

_Drawn from the review and neighbor packages. Edit freely._

**In scope**

- Projection descriptors: perspective + orthographic, narrowers, `setProjectionMatrix4`.
- Camera entity + view/view-projection composition (`lookAt`, from-matrix, jitter).
- Picking: screen→world ray, world→screen projection.
- Culling: frustum extraction + point/sphere/box predicates, frustum corners.
- Basis/eye extraction and depth recovery (linear depth, view-space Z).
- Ray-against-bounding-sphere / ray-against-plane ergonomics for camera-driven picking.

**Out of scope (non-goals)**

- Photo / device capture — `@flighthq/webcam`.
- Camera controllers (orbit / fly / first-person, input handling) — a future `@flighthq/camera-controller`.
- Matrix / frustum / ray / plane primitive math — `@flighthq/geometry`.
- 3D scene graph, meshes, lights, textures — `scene` / `mesh` / `lighting` / `texture`.
- Rendering — `scene-gl` / `scene-wgpu` and the `render*` core.

## Decisions

None blessed yet.

## Open directions

_Every candidate question the review surfaced, plus the structural forks that touch this package. An agent asks here rather than assuming._

1. **Does `inverseViewProjection` belong on the `Camera` entity at all?** It is derived, written only by `updateCameraInverseViewProjection`, and read only by the effects packages (TAA / velocity / fog / DoF), never within `camera`. This is the **entity/runtime-slot pattern (fork A)** applied to a 3D entity: keep it a public cache field, move it to a runtime slot owned by the effects subsystem, or drop it and have effects compute it. Charter should rule.

2. **Is `getCameraLinearDepth` perspective-only or projection-aware?** Today it always applies the perspective depth inversion and is wrong for orthographic (the doc comment's "same formula applies" claim is false; tests only cover perspective). If projection-aware, it must branch on `projection.kind` — which feeds the **closed-union-vs-registry fork (B)**: `setProjectionMatrix4` is already a closed `kind` switch, and off-axis / reversed-Z / infinite-far variants grow it. Charter should decide whether projection kinds stay a closed union (small, tight, in-a-closed-system) or become an open registry as the family grows — and, in the meantime, whether `getCameraLinearDepth` is scoped to perspective or fixed to branch.

3. **Where is the geometry↔camera line for ray/plane math?** `intersectCameraRayWithPlane` is a fully general ray-plane intersection with nothing camera-specific in it; `getCameraRayThroughBoundingSphere` is the camera-flavored companion. Should `camera` re-export general geometry ergonomics for picking convenience, or do such helpers home in `@flighthq/geometry` and camera only adds the camera-specific wrapping?

4. **Is a stored viewport (`setCameraViewport`) the intended end-state?** `aspect` is threaded through every `get*` / `setProjection*` call and also stored on the descriptor — a dual source of truth. A `setCameraViewport(camera, w, h)` / `getCameraAspect` would retire the threaded argument, but touches every `aspect`-threaded call site in the `scene-gl` effects — a cross-package change the charter should bless before a worker takes it.

5. **What is the camera's scope vs. controllers and the 3D pipeline?** State the boundary to a future `@flighthq/camera-controller` and to `scene` / `mesh`, so the off-axis / stereo / VR question has a home: is an asymmetric/off-axis frustum a single-camera projection variant (a new `kind` + a `setProjectionMatrix4` branch), or a separate stereo-rig abstraction? Same question governs reversed-Z / infinite-far perspective, which also couples to the GPU NDC-range convention in `render-gl` / `render-wgpu`.

6. **3D scope and the additivity gate (fork G).** Full 3D is now in scope and `camera` is a real crate in the 3D family. The charter should confirm camera follows the **strictly-additive** rule — a 2D bundle pays nothing for it — and flag that the TS `index.md` Package Map currently has no explicit `camera` bullet (the 3D family is documented only in `rust/index.md`); whether to add explicit 3D-subject bullets is the user's call.

7. **Rust conformance is as-claimed, not compiled.** The `flighthq-camera` crate exists in the bundle but was never built (`cargo` unavailable; "correct by inspection"). The charter/assessment should treat Rust parity as unverified until a compile+conformance pass runs.
