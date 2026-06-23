# Filename Alignment: @flighthq/materials

**Verdict:** Single-implementation domain package (no backend variants, so no backend prefix required) — all source filenames name a domain or object family rather than a function, and every source has a colocated `*.test.ts`; the package is clean, with one borderline naming note on `unlitMaterials.ts`.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| unlitMaterials.ts | Borderline: filename says "unlit" but the file holds a broader set than truly-unlit materials — `UnlitMaterial`, `EmissiveMaterial`, `VertexColorMaterial` are unlit, while `ToonMaterial`/`MatcapMaterial` are stylized-shaded and `DepthMaterial`/`NormalMaterial`/`WireframeMaterial` are debug/utility passes. The name under-describes the contents. Not a function-named or generic name, so this is a refinement, not a violation. | Acceptable as-is; if split desired, `stylizedMaterials.ts` (toon/matcap/unlit/vertexColor/emissive) + `debugMaterials.ts` (depth/normal/wireframe), or keep one file and rename to a category that covers all members. Surface as a suggestion, not an autonomous change. |

## Clean

- `material.ts` — base `Material` entity (`createMaterial`, `equalsMaterial`). Names the object.
- `surfaceMaterial.ts` — `SurfaceMaterial` base/trailer constructor. Names the object.
- `color.ts` — `LinearColor` type plus sRGB→linear unpack and RGB hex helpers. Names the domain.
- `colorTransform.ts` — `ColorTransform` value operations (create/copy/concat/invert/equals/offset accessors). Names the object.
- `colorTransformMaterial.ts` — `ColorTransformMaterial` + `UniformColorTransformMaterial` constructors. Names the object family.
- `classicMaterials.ts` — classic lighting models (Blinn-Phong, Lambert, Phong). Names a recognized material family.
- `pbrMaterials.ts` — standard metallic-roughness and specular-glossiness PBR materials. Names the domain family.
- `pbrExtensionMaterials.ts` — PBR extension materials (anisotropy, clearcoat, iridescence, sheen, specular, subsurface, transmission/volume). Names the domain family.
- `index.ts` — thin barrel re-export only (not a dumping ground). Appropriate.
