# scene-wgpu status

## 2026-06-25 — builder R2-4 second-pass recovery

Re-ran the dist↔src diff for `scene-wgpu` after the parallel `@flighthq/types` type-recovery pass, to pick up modules the first pass parked for "needs type X" that may now be unblocked.

Diff result is unchanged from the first pass: the only module in `dist/*.js` absent from `src/` is `wgpuForwardLightsPrelude`, and the only structural drift in existing files is the reduced `wgpuSceneRuntime` (missing `DrawSceneTransparentEntry` + the `drawScene*`/`lightBlock*` fields) and the reduced `drawWgpuScene` (no transparent pass, no forward-light upload). No existing src file is missing an exported function, and no lost colocated tests exist outside the parked cluster. `src/index.ts` differs from `dist/index.js` only by the `wgpuForwardLightsPrelude` export line (parked).

The blocker is still live: `dist/wgpuForwardLightsPrelude.js` does `import { MaxForwardLights } from '@flighthq/types'` and uses it as a runtime value. `MaxForwardLights` is **still absent** from `@flighthq/types` (src and dist) after the type-recovery pass — only the prose token `MAX_FORWARD_LIGHTS` appears, in comments of `SceneLightBlock.ts`/`SceneLights.ts`. The sibling `scene-gl` likewise has no `MaxForwardLights` reference, confirming the forward-lights feature is a cross-package loss whose header symbol was not restored. Adding it would require editing `@flighthq/types`, which is outside the hard boundary. So the entire forward-lights cluster remains parked as one coupled unit (prelude module → `wgpuSceneRuntime` fields → `wgpuMeshPipeline` LightBlock binding(1) → enhanced `drawWgpuScene`). No src edits made; baseline preserved.

### Recovered

None. Same conclusion as the first pass — the only lost work is the forward-lights / transparent-sort cluster, still blocked by the missing `MaxForwardLights` symbol in `@flighthq/types` (hard boundary).

### Parked

- **`wgpuForwardLightsPrelude` (whole module)** — needs value/const `MaxForwardLights` in `@flighthq/types`, still absent after the type-recovery pass. Lost exports: `WgpuForwardLightsDefineKey`, `buildWgpuForwardLightsDefineKeySuffix`, `buildWgpuForwardLightsDefineSource`, `ensureWgpuLightBlockBindGroup`, `ensureWgpuLightBlockBuffer`, `getWgpuForwardLightsPreludeWgsl`, `writeWgpuLightBlockUniform`.
- **`wgpuSceneRuntime` enhancement** — `DrawSceneTransparentEntry` + the `WgpuSceneRuntime` fields `drawSceneClipPos`/`drawSceneNormalMatrix`/`drawSceneTransparentEntries`/`drawSceneWorldOrigin`/`lightBlockBindGroup`/`lightBlockBuffer`. All referenced types exist, but every field feeds a consumer that cannot land (the `lightBlock*` pair → parked prelude; the `drawScene*` scratch → enhanced `drawWgpuScene`). Parked with the cluster to avoid dead exported surface / untested runtime state.
- **`drawWgpuScene` enhancement** — transparent depth-sort + per-instance normal matrix + forward-light upload. Same public signature as current src (not a missing export), but imports `writeWgpuLightBlockUniform` from the parked prelude and reads the parked runtime fields. Parked with the cluster.
- **`wgpuMeshPipeline` LightBlock binding(1) wiring** — dist `ensureWgpuFrameBindGroup` allocates a second uniform buffer (`scene.lightBlockBuffer`) and binds it at `@group(0) @binding(1)`. Couples to the parked runtime fields and the parked prelude; parked with the cluster.

### Fossils skipped

None. No dropped-concept modules (cacheAsBitmap, scrollRect, Loader, Stage setters, Bitmap pixelSnapping, displayobject lifecycle signals, traversal wrappers) appear in this package.

### Tests

`npm run test --workspace=packages/scene-wgpu` — 35 files, 168 tests, all passing. No src edits this pass; suite unchanged from baseline.

## 2026-06-25 — builder R2-4 lost-source recovery

Compared `packages/scene-wgpu/dist/*.js` (+ `.d.ts`) against `packages/scene-wgpu/src/` to recover source pruned by the integration curation. Findings below.

### Recovered

None. The only lost work in this package is a single coupled feature cluster (forward punctual lighting + transparent depth-sorting), and its lynchpin module is blocked by the `@flighthq/types` hard boundary (see Parked). Recovering the recoverable fringe of that cluster in isolation would add exported surface and runtime state with no live consumer, so it was parked as one unit.

### Parked

- **`wgpuForwardLightsPrelude` (whole module)** — needs value/const `MaxForwardLights` in `@flighthq/types`. `dist/wgpuForwardLightsPrelude.js` does `import { MaxForwardLights } from '@flighthq/types'` and uses it as a value (`Math.min(count, MaxForwardLights)`, WGSL array sizes, LightBlock buffer sizing). `MaxForwardLights` is absent from `@flighthq/types` src and dist (only the prose token `MAX_FORWARD_LIGHTS` appears, in comments of `SceneLightBlock.ts` / `SceneLights.ts`). Adding the symbol would require editing `@flighthq/types`, which is outside the hard boundary. Exports lost: `WgpuForwardLightsDefineKey`, `buildWgpuForwardLightsDefineKeySuffix`, `buildWgpuForwardLightsDefineSource`, `ensureWgpuLightBlockBindGroup`, `ensureWgpuLightBlockBuffer`, `getWgpuForwardLightsPreludeWgsl`, `writeWgpuLightBlockUniform`.

- **`wgpuSceneRuntime` enhancement** (`DrawSceneTransparentEntry` interface + the `WgpuSceneRuntime` fields `drawSceneClipPos`, `drawSceneNormalMatrix`, `drawSceneTransparentEntries`, `drawSceneWorldOrigin`, `lightBlockBindGroup`, `lightBlockBuffer`, and their initializers, plus the two added test cases). All referenced types exist (`Matrix3`/`Matrix4`/`Mesh`/`Vector4Like` in `@flighthq/types`, `createMatrix3` in `@flighthq/geometry`), so this part is technically recoverable in isolation — but every new field exists solely to feed two consumers that cannot land: the `lightBlock*` pair feeds the parked `wgpuForwardLightsPrelude`, and the `drawScene*` scratch fields exist (per the dist test's own wording) "so drawWgpuScene has no module-level singletons", i.e. they feed the enhanced `drawWgpuScene` below. Landing them alone yields dead exported surface and untested runtime state. Parked with the cluster.

- **`drawWgpuScene` enhancement** (transparent depth-sorting + per-instance normal matrix + forward-light upload). Same public signature as the current src `drawWgpuScene` (not a missing export — the API surface is intact), but `dist/drawWgpuScene.js` is a more advanced implementation that `import { writeWgpuLightBlockUniform } from './wgpuForwardLightsPrelude'` and reads the parked `wgpuSceneRuntime` draw-scene fields. Cannot compile without the parked module; parked with the cluster.

### Fossils skipped

None. No dropped/deprecated-concept modules (cacheAsBitmap, scrollRect, Loader, Stage setters, Bitmap pixelSnapping, Video smoothing, etc.) appear in this package.

### Tests

`npm run test --workspace=packages/scene-wgpu` — 35 files, 168 tests, all passing. No src edits were made (the only lost work is the parked cluster), so the suite is unchanged from baseline.
