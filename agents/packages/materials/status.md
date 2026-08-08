---
package: '@flighthq/materials'
updated: 2026-08-08
by: principal
---

# materials — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/materials/src/` on 2026-08-08. A file:line here is
a claim about this tree, not about a session.

- **`equalsMaterial` and `cloneMaterial` disagree about `standard`.** `equalsMaterial`
  (`material.ts:28`) compares every own field with `!==`, so `standard` and `extensions` are
  reference compares; `copyMaterialFields` (`material.ts:52`) deliberately spreads `standard` into a
  *new* object. `equalsMaterial(cloneMaterial(m), m)` is therefore `false` for every
  `ExtendedPbrMaterial` (`extendedPbrMaterial.ts:9`). One of the two has to move.
- **No guard or explain surface exists** — zero `explain*` / `enable*Guards` anywhere in the package.
  `convertSpecularGlossinessToStandardPbr` (`pbrMaterials.ts:25`) silently clears the incompatible
  metallic-roughness map with nothing to report the drop. An actual packed specular-RGB /
  glossiness-A texture bake is a separate, unwritten operation.
- **`ColorScaleBias` — a pointwise-Adjustment payload — still lives here** (`colorScaleBias.ts`, 16
  exports). `node` and `render` import `@flighthq/materials` purely for it
  (`node/src/nodeColorAdjustment.ts:8`, `render/src/enableColorAdjustments.ts:2`), while
  `@flighthq/adjustments` itself depends only on `@flighthq/types`. The ratified architecture has
  this package shrinking to shading kinds only; this is the residue.
- **Model conversion is one-way.** `convertPhongToStandardPbrMaterial` (`phongToPbr.ts:17`) and
  `convertSpecularGlossinessToStandardPbr` both land *into* metallic-roughness;
  `convertStandardPbrToSpecularGlossiness` does not exist anywhere in the tree.
- **`KHR_texture_transform` is unsupported** — no `TextureTransform.ts` in `packages/types/src/`, and
  no per-map transform field on any material map descriptor. Cross-package: the GPU crates read it.
- **No `serializeMaterial` / `deserializeMaterial`.** The map-handle ↔ resource-id seam is still
  undesigned, and materials must not import resource loading.
- **No shading math here** — Fresnel/GGX/IBL appear only in comments (`phongToPbr.ts:8`,
  `materialValidation.ts:31`). Whether BRDF primitives belong in this package or stay in the renderer
  backends is a user ruling with Rust-conformance consequences, not an agent call.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the 2026-06-25 "parked" pair as
  false: `equalsMaterial` *does* run the generic `aFields[key] !== bFields[key]` loop
  (`material.ts:32`) and `cloneMaterial` / `copyMaterial` *do* exist (`material.ts:6`, `:14`) — the
  entry claimed neither did. Also dropped the whole color-utility thread (`color.ts`, `HslColor` /
  `HsvColor` locality, the `computeRgbHexString` verb split, the OKLab tier): none of it is in this
  package any more — it lives in `@flighthq/color` (`packColor.ts`, `oklab.ts`) and
  `packages/types/src/HslColor.ts`. The `materials-formats` neighbor is likewise moot; glTF material
  import shipped in `scene3d-formats/src/gltf*.ts`.
- **2026-08-05** — Composable PBR redesign verified at the model layer: `ExtendedPbrMaterial` holds an
  ordered kind-keyed extension list over a structural `standard` block; standalone extension-material
  families gone; glass composes a property block plus a transmission/volume descriptor.
- **2026-06-25** — Recommended sweep: renamed `createColorTransform`'s param `obj` → `opts`; two other
  items described code that had already been refactored away.
- **2026-06-24** — `builder-67dc46d64` bundle ingested as-claimed (clone/copy/equals, spec-gloss
  conversion, validation helpers, 11 named presets).
