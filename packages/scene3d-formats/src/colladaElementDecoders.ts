import type { ColladaElementDecoderDescriptor } from '@flighthq/types/contract';

import { COLLADA_FEATURE_ELEMENTS } from './colladaFeatures.ts';

/**
 * The COLLADA element-decoder family: which decoder reads which elements, for which feature.
 *
 * ★ WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. It is the explicit, greppable declaration of the
 * six decoders `parseCollada` composes, stated as data a caller can read and select from. It is NOT a
 * dispatch table the parser consults, and nothing here registers itself: `parseCollada` calls the same
 * functions in the same order it always did, so parse semantics are untouched.
 *
 * ★ WHY `decode` IS ABSENT RATHER THAN UNIFORM. The six decoders do not share a signature today, and
 * three are not callable from outside at all. `appendColladaMaterials` takes six parameters and appends
 * into caller-owned arrays; `decodeColladaControllers` takes XML text and returns skins; the camera and
 * light decoders are module-private; and geometry has no function of its own — it is inlined in
 * `parseCollada`'s walk. Giving them a common `decode(root, out, diagnostics)` member would mean
 * rewriting all six call sites and the state they thread through, which is precisely the change of parse
 * semantics this is not allowed to make. Inventing the member and leaving it unimplemented would be
 * worse: a family whose central operation is a lie reads as a working seam to the next reader.
 *
 * So each entry records what is TRUE now — the feature, the elements claimed, and whether the decoder
 * is reachable from outside the package. `entryPoint: null` is a statement that the decoder is internal,
 * not an omission, and it marks exactly what a future registrable seam would have to extract first.
 */

export const COLLADA_ELEMENT_DECODERS: readonly ColladaElementDecoderDescriptor[] = [
  { elements: ['animation'], entryPoint: 'decodeColladaAnimations', feature: 'Animation' },
  // Internal: `decodeColladaCameraDefinitions` is module-private to colladaParse.
  { elements: ['camera'], entryPoint: null, feature: 'Camera' },
  // Skins and morphs are two decoders over one element, which is why the feature is the controller
  // rather than either of them. Both are exported; the skin path is named here as the primary.
  { elements: ['controller'], entryPoint: 'decodeColladaControllers', feature: 'Controller' },
  // Internal: geometry has no decoder of its own — it is read inline by `parseCollada`'s walk.
  { elements: ['geometry'], entryPoint: null, feature: 'Geometry' },
  // Internal: `parseColladaLightDefinitions` is module-private to colladaParse.
  { elements: ['light'], entryPoint: null, feature: 'Light' },
  { elements: ['material', 'effect'], entryPoint: 'appendColladaMaterials', feature: 'Material' },
];

/** The decoders that claim one COLLADA element, by local name. */
export function findColladaElementDecoders(element: string): readonly ColladaElementDecoderDescriptor[] {
  return COLLADA_ELEMENT_DECODERS.filter((decoder) => decoder.elements.includes(element));
}

/**
 * The features the family covers — the join between what a document is analyzed FOR and what the
 * package can actually decode.
 *
 * Derived rather than listed so the two cannot drift: a feature added to the analyzer without a decoder,
 * or a decoder added without an analyzable feature, is caught by the accompanying test instead of
 * shipping as an inventory nothing can satisfy.
 */
export function getColladaDecoderFeatures(): readonly string[] {
  return [...new Set(COLLADA_ELEMENT_DECODERS.map((decoder) => decoder.feature))].sort();
}

// Referenced so a feature renamed in the analyzer cannot leave this file quietly stale: the test asserts
// the two agree, and this import is what makes that comparison possible at all.
export const COLLADA_ANALYZED_FEATURES: readonly string[] = [...COLLADA_FEATURE_ELEMENTS.keys()].sort();
