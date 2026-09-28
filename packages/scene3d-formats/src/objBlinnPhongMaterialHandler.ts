import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import type {
  BlinnPhongMaterial,
  ImportDiagnostic,
  ObjMaterial,
  ObjMaterialHandler,
  Scene3DDocument,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, OBJ_MATERIAL_BLINN_PHONG_FEATURE } from '@flighthq/types/contract';

import { externalObjTexture, packObjColor } from './objMaterialHelpers.ts';
import { hasObjPbrDirectives } from './objMaterialModel.ts';

export const objBlinnPhongMaterialHandler: Readonly<ObjMaterialHandler> = {
  feature: OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  matches(material) {
    return !hasObjPbrDirectives(material);
  },
  resolve(material, document, diagnostics) {
    return objMaterialToBlinnPhong(material, document, diagnostics);
  },
};

export function objMaterialToBlinnPhong(
  material: Readonly<ObjMaterial>,
  document: Scene3DDocument,
  diagnostics: ImportDiagnostic[] | undefined,
): BlinnPhongMaterial {
  const result = createBlinnPhongMaterial({
    // map_d is a dedicated coverage image, separate from the diffuse map's own alpha channel.
    alphaMap: externalObjTexture(material.mapDissolve, document, 'linear'),
    diffuse: packObjColor(material.diffuse, material.dissolve),
    diffuseMap: externalObjTexture(material.mapDiffuse, document, 'srgb'),
    // ONLY `norm` binds. `map_Bump`/`bump` is a grayscale HEIGHT field, not a tangent-space normal
    // map: a shader decoding its RGB as 2*c-1 direction vectors reads elevation as orientation and
    // lights the surface from nonsense normals. It is parsed and reported, never bound, until a real
    // height-map feature exists to consume it — the same call 3DS already makes for MAT_BUMPMAP.
    normalMap: externalObjTexture(material.mapNormal, document, 'linear'),
    shininess: material.specularExponent,
    specular: packObjColor(material.specular, 1),
    specularMap: externalObjTexture(material.mapSpecular, document, 'srgb'),
  });
  // A dissolve below 1 is a translucent material; carry it as the diffuse alpha (above) plus a blend
  // alphaMode so the renderer actually blends rather than treating the alpha as coverage-only. A map_d
  // does the same: an alphaMap is INERT while alphaMode is 'opaque', so an authored coverage image would
  // silently do nothing. The scalar and the map multiply, so a material stating both keeps both.
  if (material.dissolve < 1 || material.mapDissolve !== null) result.alphaMode = 'blend';
  // Blinn-Phong has no emissive channel in Flight, so a file that stated one WITHOUT also stating any
  // metallic-roughness value loses it. Reinterpreting the whole material as PBR to keep it would trade a
  // stated Ns for a guessed roughness plus an uncompensable π brightness shift — a worse loss than this.
  if (material.emissive !== null || material.mapEmissive !== null) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'mtl.emissive-dropped', 'resolveObjMaterial', {
      name: material.name,
    });
  }
  // A `map_Bump`/`bump` entry is carried into ObjMaterial but never bound: it is a height field and
  // there is no height-map feature to consume it yet. Reported so a consumer can see their authored
  // map was understood and deliberately not used, rather than silently ignored.
  if (material.mapBump !== null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'mtl.bump-height-map-unbound',
      'objMaterialToBlinnPhong',
      { name: material.name },
    );
  }

  return result;
}
