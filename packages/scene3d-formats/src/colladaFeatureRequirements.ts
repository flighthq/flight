import type { Requirement } from '@flighthq/types/contract';
import { RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

/**
 * Which scene requirements a COLLADA feature implies — the fact that turns a FORMAT requirement
 * into a RENDERER requirement at build time.
 *
 * The COLLADA counterpart of `THREE_DS_CHUNK_SCENE_REQUIREMENTS`. Keyed by the feature name that
 * `collectColladaFeatures` returns (the same name `parseColladaRequirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the feature implies.
 *
 * COLLADA materials always produce `StandardPbrMaterial` — the handler maps COLLADA's
 * common/phong/blinn profiles to PBR values.
 */
export const COLLADA_FEATURE_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  ['Material', [{ facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind }]],
]);
