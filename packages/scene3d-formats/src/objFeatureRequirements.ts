import type { Requirement } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

/**
 * Which scene requirements an OBJ feature implies — the fact that turns a FORMAT requirement into
 * a RENDERER requirement at build time.
 *
 * The OBJ counterpart of `THREE_DS_CHUNK_SCENE_REQUIREMENTS`. Keyed by the feature name that
 * `collectObjFeatures` returns (the same name `parseObjRequirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the feature implies.
 *
 * A material-bearing OBJ conservatively emits BOTH BlinnPhong and StandardPbr: the analyzer sees
 * OBJ bytes but not the resolved MTL content, so it cannot determine which shading model the
 * materials actually use. A file with classic MTL (Ka/Kd/Ks/Ns) produces BlinnPhongMaterial; one
 * with PBR extensions (Pr/Pm) produces StandardPbrMaterial; and the analyzer cannot tell them apart
 * from the OBJ text alone.
 */
export const OBJ_FEATURE_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  [
    'Material',
    [
      { facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind },
      { facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind },
    ],
  ],
]);
