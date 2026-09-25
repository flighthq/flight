import type { Requirement } from '@flighthq/types/contract';
import { RequirementFacet, ShadedMaterialKind } from '@flighthq/types/contract';

/**
 * Which scene requirements an AWD2 block type implies — the fact that turns a BLOCK requirement
 * into a RENDERER requirement at build time.
 *
 * The AWD2 counterpart of SWF's `SWF_TAG_NODE_KINDS`. Keyed by the BLOCK NAME that
 * `getAwd2BlockName` returns (the same name `parseAwd2Requirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the block implies.
 *
 * AWD2 material blocks always produce `ShadedMaterial` — the handler calls
 * `createShadedMaterial` unconditionally, and the kind dispatch that selects a renderer is keyed
 * on that. A build that resolves the `Material` block's parser handler but not its material
 * renderer draws geometry with no surface, which is the gap this mapping closes.
 */
export const AWD2_BLOCK_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  ['Material', [{ facet: RequirementFacet.SceneMaterialKind, key: ShadedMaterialKind }]],
]);

export const AWD2_DOCUMENT_SCENE_REQUIREMENTS: readonly Requirement[] = [];
