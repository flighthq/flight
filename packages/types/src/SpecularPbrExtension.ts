import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// KHR_materials_specular: independent dielectric F0 strength and color.
export interface SpecularPbrExtension extends PbrExtension {
  readonly kind: 'SpecularPbrExtension';
  specular: number;
  specularColor: number;
  specularColorMap: Texture | null;
  specularColorMapUvSet: PbrUvSet;
  specularMap: Texture | null;
  specularMapUvSet: PbrUvSet;
}

export const SpecularPbrExtensionKind = 'SpecularPbrExtension';
