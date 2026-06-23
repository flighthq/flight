# Filename Alignment: @flighthq/scene-wgpu

**Verdict:** Backend-variant package (`-wgpu`), so the **prefix-first** rule applies — the `wgpu` token should lead every filename. Infrastructure files obey it; the 23 material-renderer / `draw` / `register` files lead with the material/verb and embed `Wgpu` mid-name (infix), violating prefix-first. The deviation is fully systemic and mirrors the sibling `scene-gl` exactly, so it is a deliberate package-wide convention choice, not drift. No generic dumping-ground names exist. The infix-vs-prefix question is the only real finding and should be decided once for the whole 3D-renderer family (`scene-gl`, `scene-wgpu`, `displayobject-gl`, `displayobject-wgpu`), not flipped here in isolation.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `standardPbrWgpuMeshMaterialRenderer.ts` | Backend token `Wgpu` is infix, not prefix-first. Material name leads; the "where am I / what backend" cue is buried mid-name. | `wgpuStandardPbrMeshMaterialRenderer.ts` |
| `anisotropyPbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix, not prefix-first. | `wgpuAnisotropyPbrMeshMaterialRenderer.ts` |
| `blinnPhongWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuBlinnPhongMeshMaterialRenderer.ts` |
| `clearcoatPbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuClearcoatPbrMeshMaterialRenderer.ts` |
| `depthWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuDepthMeshMaterialRenderer.ts` |
| `emissiveWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuEmissiveMeshMaterialRenderer.ts` |
| `iridescencePbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuIridescencePbrMeshMaterialRenderer.ts` |
| `lambertWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuLambertMeshMaterialRenderer.ts` |
| `matcapWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuMatcapMeshMaterialRenderer.ts` |
| `normalWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuNormalMeshMaterialRenderer.ts` |
| `phongWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuPhongMeshMaterialRenderer.ts` |
| `sheenPbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuSheenPbrMeshMaterialRenderer.ts` |
| `specularGlossinessPbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuSpecularGlossinessPbrMeshMaterialRenderer.ts` |
| `specularPbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuSpecularPbrMeshMaterialRenderer.ts` |
| `subsurfacePbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuSubsurfacePbrMeshMaterialRenderer.ts` |
| `toonWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuToonMeshMaterialRenderer.ts` |
| `transmissionVolumePbrWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuTransmissionVolumePbrMeshMaterialRenderer.ts` |
| `unlitWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuUnlitMeshMaterialRenderer.ts` |
| `vertexColorWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuVertexColorMeshMaterialRenderer.ts` |
| `wireframeWgpuMeshMaterialRenderer.ts` | Same — `Wgpu` infix. | `wgpuWireframeMeshMaterialRenderer.ts` |
| `drawWgpuScene.ts` | Backend token infix; verb (`draw`) leads. Reads as one function but the scene-draw entry point is a legit domain object, so the flag is prefix-order only. | `wgpuSceneDraw.ts` (or keep `drawWgpuScene.ts` if verb-first is the accepted shape) |
| `registerStandardPbrWgpuMaterial.ts` | Backend token infix; named after the single exported `register*` function (no other exports). Borderline single-function file. | Fold into `wgpuStandardPbrMeshMaterialRenderer.ts` (its `register*` belongs with the renderer it registers), or rename `wgpuStandardPbrMaterialRegister.ts` if kept separate. |

## Clean

These follow the prefix-first backend convention and name a clear domain/object — no changes needed:

- `wgpuClassicPrelude.ts` — Classic (Blinn-Phong/Lambert/Phong) shader prelude.
- `wgpuDebugPrelude.ts` — debug-material shader prelude.
- `wgpuMatcapPrelude.ts` — matcap shader prelude.
- `wgpuPbrPrelude.ts` — PBR shader prelude.
- `wgpuToonPrelude.ts` — toon shader prelude.
- `wgpuUnlitPrelude.ts` — unlit shader prelude.
- `wgpuWireframePrelude.ts` — wireframe shader prelude.
- `wgpuMeshPipeline.ts` — mesh render-pipeline construction.
- `wgpuPbrPipelineCache.ts` — PBR pipeline cache.
- `wgpuMeshUpload.ts` — mesh geometry GPU upload.
- `wgpuWireframeUpload.ts` — wireframe geometry GPU upload.
- `wgpuMeshMaterialRegistry.ts` — material-renderer registry (kind → renderer).
- `wgpuSceneRuntime.ts` — per-state scene runtime / caches.
- `wgpuSceneTestHelper.ts` — shared test fixture (`makeWgpuSceneState`); no colocated `.test.ts` expected for a test helper.
- `index.ts` — thin barrel, re-export only (not a dumping ground).

No generic-name violations: there are no `data.ts`, `utils.ts`, `helpers.ts`, `format.ts`, `math.ts`, or `common.ts` files. Every name carries a domain or object. Tests are colocated `*.test.ts` and mirror their source filenames one-to-one.
