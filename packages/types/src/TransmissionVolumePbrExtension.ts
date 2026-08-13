import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// KHR_materials_transmission + KHR_materials_volume + KHR_materials_ior: refractive transport
// through a finite absorbing volume.
export interface TransmissionVolumePbrExtension extends PbrExtension {
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer.
  attenuationColor: number;
  attenuationDistance: number;
  ior: number;
  readonly kind: 'TransmissionVolumePbrExtension';
  thickness: number;
  thicknessMap: Texture | null;
  thicknessMapUvSet: PbrUvSet;
  transmission: number;
  transmissionMap: Texture | null;
  transmissionMapUvSet: PbrUvSet;
}

export const TransmissionVolumePbrExtensionKind = 'TransmissionVolumePbrExtension';
