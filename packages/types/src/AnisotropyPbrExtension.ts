import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// KHR_materials_anisotropy: directionally stretches the microfacet response along mesh tangents.
// The map stores tangent-space direction in RG and strength in B.
export interface AnisotropyPbrExtension extends PbrExtension {
  anisotropyMap: Texture | null;
  anisotropyMapUvSet: PbrUvSet;
  anisotropyRotation: number;
  anisotropyStrength: number;
  readonly kind: 'AnisotropyPbrExtension';
}

export const AnisotropyPbrExtensionKind = 'AnisotropyPbrExtension';
