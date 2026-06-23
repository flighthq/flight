# Depth Review: @flighthq/camera

**Domain:** 3D camera — projection descriptors, view-matrix construction, and view-projection composition for a real-time 3D renderer (the scene-render pipeline). Photo/device capture is explicitly out of scope; it lives in `@flighthq/webcam`.

**Verdict:** partial — completeness **42/100**

The package is a clean, correct, well-documented core for _the matrix half_ of a camera: it can build perspective and orthographic projection matrices, set a view matrix from a look-at or a precomputed matrix, compose view-projection, and invert it. That is exactly the surface the existing TAA / velocity / fog / depth-of-field effects need, and it is the slice the package was scoped to feed. But measured against an _authoritative_ 3D-camera library, it stops well short: there is no unprojection (screen→world ray), no projection (world→screen), no frustum extraction or culling, no frustum-corner reconstruction, no off-axis/oblique projection, and no position/direction extraction from the view. A user reaching for a "camera" library would expect at least picking and culling support, and those are entirely absent.

## Present capabilities

Projections (`projection.ts`):

- `createPerspectiveProjection({ fovY, aspect? })` — vertical-FOV perspective descriptor; `aspect` defaults to 1.
- `createOrthographicProjection({ halfWidth, halfHeight })` — symmetric ortho descriptor by view-volume half-extents.
- `isPerspectiveProjection` / `isOrthographicProjection` — discriminated-union narrowers on `kind`.
- `setProjectionMatrix4(out, projection, aspect, near, far)` — writes the projection matrix, delegating to geometry's `setPerspectiveMatrix4` / `setOrthographicMatrix4`; runtime `aspect` overrides a perspective descriptor's stored aspect so one descriptor can drive a resizing viewport. Alias-safe.

Camera entity (`camera.ts`):

- `createCamera({ projection, near, far })` — allocates the entity/runtime camera; stores `view` (identity), `near`/`far`, `jitter` (zero), and a cached `inverseViewProjection` (identity). The view matrix is canonical (no separate Transform3D).
- `setCameraViewMatrix4FromLookAt(camera, eye, target, up)` — right-handed look-at view construction; alias-safe across the vector inputs.
- `setCameraViewMatrix4FromMatrix4(camera, view)` — copy a precomputed view matrix in.
- `getCameraViewProjectionMatrix4(out, camera, aspect)` — projection × view; alias-safe.
- `getCameraInverseViewProjectionMatrix4(out, camera, aspect)` — inverse of the above, returns `false` (sentinel) on a non-invertible matrix; alias-safe.
- `setCameraJitter(camera, x, y)` — per-frame sub-pixel NDC jitter for TAA.

The math is correctly delegated to `@flighthq/geometry` (the package owns descriptors + composition, not matrix internals), alias-safety is handled and documented on every out-param function, allocation is explicit (`create*`), and the failure case returns a sentinel rather than throwing. Tests cover both projection kinds, look-at, view-projection round-trips, the inverse path, and aliasing. Naming, ownership, and tree-shakable style are all on-pattern.

## Gaps vs an authoritative 3D-camera library

These are missing-by-omission for the domain, not by-design (nothing in the docs scopes them out; the scene 3D family is explicitly a real production target):

- **Unprojection / picking** — no `getCameraScreenToWorldRay` / `unprojectCamera(out, ndc, ...)`. Turning a screen/NDC point into a world-space ray is the single most-requested camera operation (mouse picking, drag, raycast); its absence is the biggest gap. The cached `inverseViewProjection` exists _for effects_ but there is no public function that uses it to unproject a point.
- **Projection (world→screen)** — no `getCameraWorldToScreen` / `projectCamera(out, worldPoint, ...)` to map a world point to NDC/pixel coordinates (HUD anchoring, labels, gizmos).
- **Frustum extraction** — no `getCameraFrustumPlanes(out, camera, aspect)` returning the six clip planes. This is table-stakes for any renderer that culls.
- **Frustum culling tests** — no `isSphereInCameraFrustum` / `isBoxInCameraFrustum` / `isPointInCameraFrustum`. Without these the camera cannot drive visibility, which a scene renderer needs.
- **Frustum corner reconstruction** — no `getCameraFrustumCorners` (the 8 world-space corners). Needed for cascaded shadow maps, debug draw, and bounds fitting.
- **Camera position / direction extraction** — no `getCameraPosition(out, camera)` or `getCameraForward/Right/Up`. `scene-gl`'s `setGlMeshCameraPosition` consumes a camera position, implying the renderer must currently recompute it from the inverse view by hand; a first-class extractor belongs here. (Specular/lighting, sorting, and LOD all want the eye position.)
- **Off-axis / oblique / asymmetric projection** — no support for an asymmetric frustum (`left/right/top/bottom`) for stereo/VR, tiled rendering, or portals. Orthographic is locked to symmetric half-extents (no `offsetX/offsetY`), and perspective offers no lens shift.
- **Advanced perspective variants** — no infinite-far or reversed-Z perspective helper, both standard in modern depth-precision-conscious renderers.
- **Aspect/viewport convenience** — `aspect` must be threaded into every `get*`/`setProjection*` call; there is no `setCameraViewport(camera, width, height)` or stored viewport, and no helper to recompute a perspective descriptor's `aspect` on resize.
- **`inverseViewProjection` is declared but never maintained** — the type and entity carry a cached `inverseViewProjection` "recomputed whenever view or projection changes," yet no function in the package writes it. The only inverse path (`getCameraInverseViewProjectionMatrix4`) writes to a caller `out`, not the cache. So the documented cache is currently dead state with no updater — either an unfinished feature or a function gap (`updateCameraInverseViewProjection`).
- **Controllers** — no orbit/fly/first-person controller. Reasonably a separate package, so call this borderline rather than a hard omission, but an "authoritative" camera offering usually ships at least one.

## Naming / API-shape notes

- Naming is excellent and fully on-pattern: full unabbreviated type words (`getCameraInverseViewProjectionMatrix4`), `Matrix4`/`Vector3` suffixes carry the operand type, `set*FromLookAt` / `set*FromMatrix4` read clearly, and the `is*` narrowers are correct.
- Out-param + alias-safety discipline is consistent and documented on every relevant function — a model for the rest of the codebase.
- One asymmetry: `getCameraViewProjectionMatrix4` / `getCameraInverseViewProjectionMatrix4` take `aspect` as a loose argument, while the perspective descriptor _also_ stores an `aspect`. The override semantics are documented but the dual source of truth is a smell; a stored viewport (see gap above) would remove the parameter from the hot call sites.
- The `inverseViewProjection` field on the entity is public state with no setter/updater in the package — it reads as an implementation detail of the effects pipeline that leaked onto the camera entity. If it is meant to be maintained, add `updateCameraInverseViewProjection`; if it is purely effect-owned, it is questionable whether it belongs on the camera type at all.

## Recommendation

Treat the matrix core as done and good — do not rework it. To reach AAA for the _camera_ domain, add, in rough priority order: (1) unprojection (`getCameraScreenToWorldRay`) and projection (`getCameraWorldToScreen`) — the picking/HUD pair; (2) frustum extraction (`getCameraFrustumPlanes`) plus the sphere/box/point culling predicates and `getCameraFrustumCorners`; (3) `getCameraPosition` / forward-right-up extractors, and migrate `scene-gl`'s position computation onto them; (4) resolve the `inverseViewProjection` cache — either provide `updateCameraInverseViewProjection` and have the effects read the cache, or drop the field; (5) off-axis/asymmetric projection options and an infinite/reversed-Z perspective variant; (6) a stored viewport (`setCameraViewport`) to retire the threaded `aspect` argument. Items 1–3 are the difference between "feeds the post-process effects" and "is a camera library a 3D app can actually use."
