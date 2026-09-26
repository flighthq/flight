import type { Requirement } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { getThreeDsChunkName } from './threeDsChunkCensus.ts';

/**
 * Which scene requirements a 3DS feature chunk type implies — the fact that turns a FORMAT
 * requirement into a RENDERER requirement at build time.
 *
 * The 3DS counterpart of AWD2's `AWD2_BLOCK_SCENE_REQUIREMENTS`. Keyed by the CHUNK NAME that
 * `getThreeDsChunkName` returns (the same name `parseThreeDsRequirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the chunk implies.
 *
 * 3DS material blocks always produce `BlinnPhongMaterial` — the parser calls
 * `createBlinnPhongMaterial` unconditionally. A build that resolves the material chunk's parser
 * handler but not its material renderer draws geometry with no surface.
 */
export const THREE_DS_CHUNK_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  [getThreeDsChunkName(0xafff), [{ facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind }]],
]);
