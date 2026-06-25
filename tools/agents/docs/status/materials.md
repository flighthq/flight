# @flighthq/materials — status

## 2026-06-25 — builder R2-4 second-pass recovery

Second pass over the gitignored `dist/` build output. Every `dist/*.js` already had a `src/*.ts` counterpart, so the remaining lost work was individual functions present in the compiled output but absent from existing source files. Merged each from its `.js` (impl + verbatim `//` comments) and `.d.ts` (types). All required types were already present in `@flighthq/types` — no parking needed.

### Recovered

- `color.ts` (16 functions) — full color toolkit absent from src, which carried only `computeRgbHexString`, `createLinearColor`, `unpackColorToLinear`. Added: `createHslColor`, `createHsvColor`, `getColorContrastRatio`, `getColorLuminance`, `hslToRgb`, `hsvToRgb`, `lerpColor`, `lerpLinearColor`, `linearChannelToSrgb`, `packColor`, `packLinearToColor`, `premultiplyColorAlpha`, `rgbToHsl`, `rgbToHsv`, `unpackColorRgba`, `unpremultiplyColorAlpha`. Restored the local `HslColor` / `HsvColor` type aliases (declared in `color.d.ts`, not in `@flighthq/types`) and the private `hueToRgbChannel` helper. Plus all colocated tests.
- `material.ts` (2 functions) — `cloneMaterial`, `copyMaterial`, plus the private `copyMaterialFields` helper and the field-loop branch of `equalsMaterial` (improved over the src stub: now structurally compares own enumerable scalar fields for non-special kinds). Plus the `cloneMaterial` / `copyMaterial` describe blocks and the structural `equalsMaterial` case.
- `pbrMaterials.ts` (1 function) — `convertSpecularGlossinessToStandardPbr` (out-param, alias-safe spec-gloss → metallic-roughness conversion), plus the private `packLinear` / `linearChannelToSrgb8` helpers and two module-level scratch buffers at the bottom. Plus its describe block.
- `surfaceMaterial.ts` (4 functions) — alpha-mode queries `getMaterialAlphaMode`, `isMaterialBlended`, `isMaterialMasked`, `isMaterialOpaque`. Moved the four `DEFAULT_*` consts to the bottom of the file per convention. Plus their describe blocks.

`index.ts` needed no change — all four files were already exported; the recovery was function-level within existing modules.

### Fossils skipped

None. No recovered function implemented a dropped/deprecated concept.

### Parked

None. Every recovered module's types (`Material`, `Kind`, `SurfaceMaterial`, `MaterialAlphaMode`, `StandardPbrMaterialProperties`, `SpecularGlossinessPbrMaterial`, `UniformColorTransformMaterial`) were present in `@flighthq/types`; `HslColor` / `HsvColor` are local to `color.ts`.

### Tests

`npm run test --workspace=packages/materials` → 11 files, 200 tests, all passing.

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `src/` below what `dist/` proves compiled. Two whole modules had dist output (`.js` + `.d.ts` + `.test.js`) with no `src/` counterpart. Both are genuine lost work — recovered via the camera pattern (impl + verbatim `//` comments from `.js`, types restored from `.d.ts`, tests from `.test.js`).

### Recovered

- `materialPresets.ts` (11 functions) — named real-world glTF metallic-roughness presets, thin tree-shakable wrappers over `createStandardPbrMaterial` / `createTransmissionVolumePbrMaterial`: `createAluminumStandardPbrMaterial`, `createCarbonStandardPbrMaterial`, `createGlassTransmissionVolumePbrMaterial`, `createGoldStandardPbrMaterial`, `createIronStandardPbrMaterial`, `createMarbleStandardPbrMaterial`, `createPlasticStandardPbrMaterial`, `createRubberStandardPbrMaterial`, `createSilverStandardPbrMaterial`, `createSkinStandardPbrMaterial`, `createWoodStandardPbrMaterial`. Plus `materialPresets.test.ts`.
- `materialValidation.ts` (5 functions) — physical-range clamping/validation for PBR scalars: `clampStandardPbrMaterialProperties` (in-place out-param clamp, returns `out`), `isValidMaterialClearcoat`, `isValidMaterialIor`, `isValidMaterialIridescenceThickness`, `isValidMaterialWeight`. Module-level IOR bound consts moved to the bottom of the file per convention. Plus `materialValidation.test.ts`.
- `index.ts` — added `export * from './materialPresets'` and `export * from './materialValidation'` (alphabetized).

All required types (`StandardPbrMaterial`, `TransmissionVolumePbrMaterial`, `StandardPbrMaterialProperties`, `StandardPbrMaterialKind`, `TransmissionVolumePbrMaterialKind`) and dependent functions (`createStandardPbrMaterial`, `createStandardPbrMaterialProperties`, `createTransmissionVolumePbrMaterial`) were already present — no `@flighthq/types` edits needed.

### Fossils skipped

None. No dist module implemented a dropped/deprecated concept.

### Parked

None.

### Tests

`npm run test --workspace=packages/materials` → 11 files, 131 tests, all passing.
