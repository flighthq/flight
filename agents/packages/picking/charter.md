---
package: "@flighthq/picking"
draft: false
lastDirection: 2026-07-03
crate: "flighthq-picking"
---

# picking — Charter

## What it is

Camera-ray scene selection -- "click to select" for 3D scenes. Composition layer over scene (raycast traversal) + camera (screen-to-world unprojection).

## North star

- The user-facing object selection API. Thin, composable, delegates heavy lifting to scene and camera.
- `pickScene` is camera unprojection + scene raycast in one call. Multi-hit, filtering, and distance limits are first-class options.
- No duplicated math: all ray-triangle intersection and spatial traversal come from scene; all unprojection comes from camera.

## Boundaries

- In scope: camera-integrated picking, multi-hit (`pickSceneAll`), filtering (predicate, maxDistance, backface cull), hit normals.
- Non-goals: raw raycast traversal (scene's `raycastSceneNode`), spatial acceleration data structures (scene's BVH).

## Decisions

- **2026-07-03 — Keep as standalone package.** Why: composition layer pattern (like movieclip over timeline). Picking is a thin bridge between camera and scene; it does not own enough logic to justify merging into either.
- **2026-07-03 — Use scene's `raycastSceneNode` internally.** Do not duplicate triangle intersection. Why: single source of truth for intersection math; picking adds camera integration and user-facing API sugar.
- **2026-07-03 — Add `pickSceneAll` for multi-hit.** Why: selection tools, transparency sorting, and analytics all need all intersections, not just the nearest.
- **2026-07-03 — Expose scene raycast options (predicate, maxDistance, backface cull).** Why: filtering is essential for practical picking; scene's raycast already supports them.
- **2026-07-03 — Replace locally duplicated transform functions with `@flighthq/geometry` imports.** Why: no duplicated math.
- **2026-07-03 — TS-leads, Rust conforms later.** Why: standard project posture.

## Open directions

- Hit normal computation (barycentric interpolation of vertex normals at intersection point).
- GPU-based picking (color ID pass) as an alternative strategy for dense scenes.
