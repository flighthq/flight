# Filename Alignment: @flighthq/scene-gl

**Verdict:** Backend-variant package (`-gl`), so every source file must be `gl`-prefixed PREFIX-FIRST. The package is split: the program/prelude/runtime infrastructure (`gl*Prelude`, `glMeshProgram`, `glSceneRuntime`, …) is clean and prefix-first, but the 24 per-material renderer files use a `<material>GlMeshMaterialRenderer.ts` SUFFIX-style name (the `Gl` token sits mid-word, sorted by material, not backend), and one file (`registerStandardPbrGlMaterial.ts`) is named after a single function. The sibling `displayobject-gl` shows the target shape: material objects there are `glDefaultMaterial.ts`, `glColorTransformMaterial.ts` — prefix-first.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `anisotropyPbrGlMeshMaterialRenderer.ts` | Suffix-style: backend token `Gl` is mid-name, file sorts under `a`, not the `gl` backend block. Not prefix-first. | `glAnisotropyPbrMaterial.ts` |
| `blinnPhongGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glBlinnPhongMaterial.ts` |
| `clearcoatPbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glClearcoatPbrMaterial.ts` |
| `depthGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glDepthMaterial.ts` |
| `emissiveGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glEmissiveMaterial.ts` |
| `iridescencePbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glIridescencePbrMaterial.ts` |
| `lambertGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glLambertMaterial.ts` |
| `matcapGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glMatcapMaterial.ts` |
| `normalGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glNormalMaterial.ts` |
| `phongGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glPhongMaterial.ts` |
| `sheenPbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glSheenPbrMaterial.ts` |
| `specularGlossinessPbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glSpecularGlossinessPbrMaterial.ts` |
| `specularPbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glSpecularPbrMaterial.ts` |
| `standardPbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glStandardPbrMaterial.ts` |
| `subsurfacePbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glSubsurfacePbrMaterial.ts` |
| `toonGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glToonMaterial.ts` |
| `transmissionVolumePbrGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glTransmissionVolumePbrMaterial.ts` |
| `unlitGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glUnlitMaterial.ts` |
| `vertexColorGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glVertexColorMaterial.ts` |
| `wireframeGlMeshMaterialRenderer.ts` | Same: suffix-style, not prefix-first. | `glWireframeMaterial.ts` |
| `registerStandardPbrGlMaterial.ts` | Named after one function (`registerStandardPbrGlMaterial`), and not prefix-first. Splits the standard-PBR registration out of the sibling renderer object file `standardPbrGlMeshMaterialRenderer.ts`. Fold it into the renamed standard-PBR material file so the object + its `register*` live together (the pattern every other material file already follows). | fold into `glStandardPbrMaterial.ts` |
| `drawGlScene.ts` | Backend token present but not prefix-first (`draw` leads). This is the marquee entry verb so it reads cleanly, but it breaks the package's `gl`-first rule; consider for consistency. | `glSceneDraw.ts` (or leave as a deliberate entry-point exception) |

## Clean

These source files name their domain/object PREFIX-FIRST and pass the remove-the-folder test:

- Shader preludes (one per shading model): `glClassicPrelude.ts`, `glDebugPrelude.ts`, `glMatcapPrelude.ts`, `glPbrPrelude.ts`, `glToonPrelude.ts`, `glUnlitPrelude.ts`, `glWireframePrelude.ts`.
- Program/pipeline objects: `glMeshProgram.ts`, `glLitProgram.ts`, `glPbrProgramCache.ts`, `glPbrStandardBlock.ts`.
- Upload objects: `glMeshUpload.ts`, `glWireframeUpload.ts`.
- Registry / runtime: `glMeshMaterialRegistry.ts`, `glSceneRuntime.ts`.
- Test helper: `glSceneTestHelper.ts` (prefix-first, domain-named).

No generic dumping-ground names (`data.ts`, `utils.ts`, `helpers.ts`, `format.ts`, etc.) exist. Tests are colocated `<source>.test.ts` for every source file (mirroring filenames exactly), except `glSceneTestHelper.ts`, which is itself a test fixture and correctly has none. `index.ts` is a barrel and is exempt.
