import type { Texture } from '@flighthq/types/contract';

import type { PbrExtension, PbrUvSet } from './PbrExtension.ts';

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
