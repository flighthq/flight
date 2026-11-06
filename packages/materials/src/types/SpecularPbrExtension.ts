import type { Texture } from '@flighthq/texture/contract';

import type { PbrExtension, PbrUvSet } from './PbrExtension.ts';

// KHR_materials_specular: independent dielectric F0 strength and color.
export interface SpecularPbrExtension extends PbrExtension {
  readonly kind: 'SpecularPbrExtension';
  specular: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer.
  specularColor: number;
  specularColorMap: Texture | null;
  specularColorMapUvSet: PbrUvSet;
  specularMap: Texture | null;
  specularMapUvSet: PbrUvSet;
}

export const SpecularPbrExtensionKind = 'SpecularPbrExtension';
