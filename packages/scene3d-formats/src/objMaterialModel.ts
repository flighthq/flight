import type { ObjMaterial } from '@flighthq/types/contract';
import { OBJ_MATERIAL_BLINN_PHONG_FEATURE, OBJ_MATERIAL_STANDARD_PBR_FEATURE } from '@flighthq/types/contract';

import { parseObjMaterialLibrary } from './mtlParse.ts';

/**
 * Which shading models an MTL library actually declares, as the feature names the OBJ analyzer emits.
 *
 * ★ THIS IS WHY THE MANIFEST CAN BE PRECISE ABOUT OBJ MATERIALS. An `.obj` file names a `mtllib` and a
 * `usemtl`, and nothing more — the shading model lives in the MTL, a separate file. Without reading it the
 * inventory had to claim BOTH models for any material-bearing OBJ, which meant every classic-MTL model
 * dragged the StandardPbr path into the bundle. Reading the library replaces that guess with the answer.
 *
 * A library may declare both, and then both are reported: MTL allows per-material shading models and the
 * importer dispatches per material, so a file mixing them genuinely needs both handlers.
 *
 * Lives here rather than in `objParse` so a build tool can ask the question without linking geometry
 * decoding, material construction, or their transitive dependencies — the same separation `objFeatures`
 * keeps for the OBJ side.
 */
export function collectObjMaterialModels(source: string): ReadonlySet<string> {
  const found = new Set<string>();
  const library = parseObjMaterialLibrary(source);
  for (const material of library.materials.values()) {
    found.add(hasObjPbrDirectives(material) ? OBJ_MATERIAL_STANDARD_PBR_FEATURE : OBJ_MATERIAL_BLINN_PHONG_FEATURE);
    // Both models found: nothing further can change the answer.
    if (found.size === 2) break;
  }
  return found;
}

// Whether the file stated any metallic-roughness PBR value for this material — the test that picks the
// shading model. Only directives describing the SHADING MODEL count: Ke/map_Ke name a channel both models
// could carry, so an otherwise-classic material with an emissive does not get reinterpreted as PBR.
export function hasObjPbrDirectives(material: Readonly<ObjMaterial>): boolean {
  return (
    material.roughness !== null ||
    material.metallic !== null ||
    material.sheen !== null ||
    material.clearcoat !== null ||
    material.clearcoatRoughness !== null ||
    material.anisotropy !== null ||
    material.anisotropyRotation !== null ||
    material.mapRoughness !== null ||
    material.mapMetallic !== null
  );
}
