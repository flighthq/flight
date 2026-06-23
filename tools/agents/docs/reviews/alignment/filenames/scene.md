# Filename Alignment: @flighthq/scene

**Verdict:** Clean. Single-implementation 3D scene-graph package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so files take plain domain/object names with no backend prefix; every source file names its object (`scene`, `sceneNode`, `mesh`) and each has a colocated mirrored test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

| File | Why it passes |
| --- | --- |
| `src/scene.ts` | Names the `Scene` object — the 3D scene-graph root node type. Self-describing without the folder. |
| `src/sceneNode.ts` | Names the `SceneNode` object — the base 3D hierarchy node. Plain domain/object name; correct for a single-implementation package. |
| `src/mesh.ts` | Names the `Mesh` object — the drawable leaf node (geometry + materials). Self-describing. |
| `src/index.ts` | Barrel re-export; expected and exempt. |
| `src/scene.test.ts` / `src/sceneNode.test.ts` / `src/mesh.test.ts` | Tests colocated as `<source>.test.ts`, mirroring each source filename exactly. |
