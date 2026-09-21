import type { Material3DOptions } from './Material3DOptions';
import type { Modifier } from './Modifier';
import type { ShadedMaterial } from './ShadedMaterial';

// Extends the shared Material3DOptions so the trailer (alphaMode/alphaCutoff/blendMode/
// doubleSided) is settable at construction, exactly as it is for BlinnPhong/PBR — no post-construction
// mutation needed to make a ShadedMaterial masked or blended.
export interface ShadedMaterialOptions extends Material3DOptions {
  diffuse?: number;
  diffuseMap?: ShadedMaterial['diffuseMap'];
  modifiers?: readonly Modifier[];
  normalMap?: ShadedMaterial['normalMap'];
  normalScale?: number;
  shininess?: number;
  specular?: number;
  specularMap?: ShadedMaterial['specularMap'];
}
