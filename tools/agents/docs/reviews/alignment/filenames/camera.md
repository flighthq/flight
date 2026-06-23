# Filename Alignment: @flighthq/camera

**Verdict:** Clean. This is a single-implementation value/math domain (3D camera + projections), NOT a backend-variant package, so plain domain/object filenames with no backend prefix are correct — and both source files (`camera.ts`, `projection.ts`) name their object/domain and pass the remove-the-folder test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

`src/` contents:

- `camera.ts` — names the `Camera` object/domain; holds the `Camera*` quartet (`createCamera`, `getCameraViewProjectionMatrix4`, `getCameraInverseViewProjectionMatrix4`, `setCameraJitter`, `setCameraViewMatrix4From*`) plus `CameraOptions`. Self-describing.
- `camera.test.ts` — colocated test mirroring `camera.ts`.
- `projection.ts` — names the `Projection` domain; holds both projection families (`createOrthographicProjection`, `createPerspectiveProjection`, `isOrthographicProjection`, `isPerspectiveProjection`, `setProjectionMatrix4`) and their option types. Self-describing — the domain word covers the orthographic/perspective variants without needing per-variant files.
- `projection.test.ts` — colocated test mirroring `projection.ts`.
- `index.ts` — thin barrel re-exporting `./camera` and `./projection`. Standard single root entry; not a dumping ground.

No single-function filenames, no generic names (`data.ts`/`utils.ts`/etc.), and no missing backend prefixes (none apply — there is no `camera-gl`/`camera-wgpu` split; this crate is the subject-agnostic value/math layer that `scene-gl`/`scene-wgpu` consume).
