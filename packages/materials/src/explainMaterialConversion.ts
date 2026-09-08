import type {
  MaterialConversionExplanation,
  PhongMaterial,
  SpecularGlossinessPbrMaterial,
} from '@flighthq/types/contract';

// Explains what `convertPhongToStandardPbrMaterial` discards. Phong's `specularMap` modulates a
// reflection-vector specular lobe; standard PBR has no slot for that quantity, and its nearest
// neighbour — metallic-roughness — packs different channels entirely. So the map is dropped, and this
// says so rather than leaving the caller to notice a flat surface.
//
// Pure and separately importable: it retains nothing, and a build that never asks carries neither the
// query nor its strings.
export function explainPhongConversion(source: Readonly<PhongMaterial>): MaterialConversionExplanation {
  if (source.specularMap === null) return { droppedMaps: [], reason: null };
  return { droppedMaps: ['specularMap'], reason: 'unsupported-by-target-model' };
}

// Explains what `convertSpecularGlossinessToStandardPbr` discards. The conversion is factor-only by
// design: `specularGlossinessMap` packs specular in RGB and glossiness in A, while
// `metallicRoughnessMap` expects metallic and roughness in different channels under a different
// colour-space rule. Assigning one to the other would not be lossy, it would be WRONG — which is why
// the converter writes null and why this reports `incompatible-channel-semantics` rather than treating
// the drop as a converter defect. Carrying the texture across needs an explicit bake.
//
// A source with no packed map loses nothing, and reports an empty list — the case a caller needs to be
// able to tell apart from the lossy one.
export function explainSpecularGlossinessConversion(
  source: Readonly<SpecularGlossinessPbrMaterial>,
): MaterialConversionExplanation {
  if (source.specularGlossinessMap === null) return { droppedMaps: [], reason: null };
  return { droppedMaps: ['specularGlossinessMap'], reason: 'incompatible-channel-semantics' };
}
