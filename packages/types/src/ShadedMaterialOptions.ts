import type { Modifier } from './Modifier';
import type { ShadedMaterial } from './ShadedMaterial';

export interface ShadedMaterialOptions {
  diffuse?: number;
  diffuseMap?: ShadedMaterial['diffuseMap'];
  modifiers?: readonly Modifier[];
  normalMap?: ShadedMaterial['normalMap'];
  normalScale?: number;
  shininess?: number;
  specular?: number;
  specularMap?: ShadedMaterial['specularMap'];
}
