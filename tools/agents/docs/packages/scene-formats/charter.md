---
package: "@flighthq/scene-formats"
draft: false
lastDirection: 2026-07-03
crate: "flighthq-scene-formats"
---

# scene-formats — Charter

## What it is

3D scene file format parsers — glTF 2.0 (.gltf/.glb), USD, OBJ, and other mesh/scene exchange formats. Parse into Flight's scene/mesh/material/animation graph.

## North star

- Import any standard 3D scene format into the Flight graph.
- Comprehensive glTF 2.0 coverage is the first milestone (materials, animations, skins, GLB binary, sparse accessors, multi-primitive).
- Pure parse/serialize — no rendering, no GPU, no DOM.

## Boundaries

- **In scope:** glTF 2.0 full spec, OBJ/MTL, USD (long-term), format auto-detection, mesh file formats (since they carry scene structure).
- **Non-goals:** Scene rendering (that's scene-gl/scene-wgpu), mesh geometry math (that's mesh), material rendering (that's materials + render backends).

## Decisions

- **2026-07-03 — Expand glTF coverage as priority.** Currently very limited: no materials, no animations, no skins, no GLB. _Why:_ glTF is the universal 3D exchange format; partial support is not useful.
- **2026-07-03 — mesh-formats is NOT a separate package.** Scene-formats covers mesh file formats since mesh files (OBJ, glTF) inherently carry scene structure (materials, transforms, hierarchy). _Why:_ splitting by geometry-only vs scene would create an artificial boundary that does not match how these formats actually work.
- **2026-07-03 — Also target USD and OBJ.** This is the home for all 3D file format parsing.
- **2026-07-03 — TS-leads, Rust conforms later.** Standard port posture.

## Open directions

- Serialize direction — should scene-formats also export glTF, or is it import-only?
- USD scope — full USD or only USDZ (Apple's subset)?
- Streaming/progressive loading — parse glTF/GLB incrementally for large files?
