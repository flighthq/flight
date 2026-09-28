import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import type {
  ImportDiagnostic,
  ObjMaterial,
  ObjMaterialHandler,
  Scene3DDocument,
  StandardPbrMaterial,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, OBJ_MATERIAL_STANDARD_PBR_FEATURE } from '@flighthq/types/contract';

import { externalObjTexture, packObjColor } from './objMaterialHelpers.ts';
import { hasObjPbrDirectives } from './objMaterialModel.ts';

export const objStandardPbrMaterialHandler: Readonly<ObjMaterialHandler> = {
  feature: OBJ_MATERIAL_STANDARD_PBR_FEATURE,
  matches(material) {
    return hasObjPbrDirectives(material);
  },
  resolve(material, document, diagnostics) {
    return objMaterialToStandardPbr(material, document, diagnostics);
  },
};

// Converts a parsed MTL material to Flight's StandardPbrMaterial — the reading for a file that states
// metallic-roughness values of its own. Kd → baseColor, Pr → roughness, Pm → metallic, Ke → emissive, and
// the map_Kd/map_Ke/norm filenames → Unresolved External refs. Nothing is inferred here: an absent Pr or
// Pm takes the constructor's own default rather than a value derived from Ns or Ks, because the point of
// this branch is that the file said what it wanted.
export function objMaterialToStandardPbr(
  material: Readonly<ObjMaterial>,
  document: Scene3DDocument,
  diagnostics: ImportDiagnostic[] | undefined,
): StandardPbrMaterial {
  const result = createStandardPbrMaterial({
    alphaMap: externalObjTexture(material.mapDissolve, document, 'linear'),
    baseColor: packObjColor(material.diffuse, material.dissolve),
    baseColorMap: externalObjTexture(material.mapDiffuse, document, 'srgb'),
    emissiveMap: externalObjTexture(material.mapEmissive, document, 'srgb'),
    // Only `norm` binds; `map_Bump` is a height field, not a normal map. See objMaterialToBlinnPhong.
    normalMap: externalObjTexture(material.mapNormal, document, 'linear'),
    ...(material.emissive !== null ? { emissive: packObjColor(material.emissive, 1) } : {}),
    ...(material.metallic !== null ? { metallic: material.metallic } : {}),
    ...(material.roughness !== null ? { roughness: material.roughness } : {}),
  });
  if (material.dissolve < 1 || material.mapDissolve !== null) result.alphaMode = 'blend';

  // MTL states roughness and metallic as SEPARATE grayscale images; glTF — and so StandardPbrMaterial —
  // carries one packed texture sampling roughness from G and metallic from B. Binding a lone grayscale
  // map to that slot would feed the same channel to both terms, so the filenames are parsed and left
  // unbound. Merging them is an image operation over decoded pixels, which a parser must not do:
  // resources are referenced here and resolved later, by an explicit pass.
  if (material.mapRoughness !== null || material.mapMetallic !== null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'mtl.metallic-roughness-map-unpacked',
      'resolveObjMaterial',
      { name: material.name },
    );
  }

  // Sheen, clearcoat, and anisotropy are read into ObjMaterial but not composed onto an
  // ExtendedPbrMaterial here. That gap is a property of THIS PARSER, not of the caller's file, so it is
  // recorded in agents/scene3d-format-coverage.md rather than crumbed — a diagnostic whose cause is our
  // own unfinished wiring tells a consumer nothing they can act on. See the import-diagnostics rule in
  // agents/conventions/diagnostics.md.
  // A `map_Bump`/`bump` entry is carried into ObjMaterial but never bound: it is a height field and
  // there is no height-map feature to consume it yet. Reported so a consumer can see their authored
  // map was understood and deliberately not used, rather than silently ignored.
  if (material.mapBump !== null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'mtl.bump-height-map-unbound',
      'objMaterialToStandardPbr',
      { name: material.name },
    );
  }

  return result;
}
