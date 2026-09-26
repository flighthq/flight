import type { Requirement } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

/**
 * Which scene requirements an MD2 feature implies — the fact that turns a FORMAT requirement
 * into a RENDERER requirement at build time.
 *
 * The MD2 counterpart of `THREE_DS_CHUNK_SCENE_REQUIREMENTS`. Keyed by the feature name that
 * `collectMd2Features` returns (the same name `parseMd2Requirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the feature implies.
 *
 * MD2 skins are diffuse texture paths decoded as BlinnPhongMaterial.
 */
export const MD2_FEATURE_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  ['Material', [{ facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind }]],
]);
