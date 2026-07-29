import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// KHR_materials_clearcoat: a second dielectric specular layer over the standard PBR surface.
export interface ClearcoatPbrExtension extends PbrExtension {
  clearcoat: number;
  clearcoatMap: Texture | null;
  clearcoatMapUvSet: PbrUvSet;
  clearcoatNormalMap: Texture | null;
  clearcoatNormalMapUvSet: PbrUvSet;
  clearcoatNormalScale: number;
  clearcoatRoughness: number;
  clearcoatRoughnessMap: Texture | null;
  clearcoatRoughnessMapUvSet: PbrUvSet;
  readonly kind: 'ClearcoatPbrExtension';
}

export const ClearcoatPbrExtensionKind = 'ClearcoatPbrExtension';
