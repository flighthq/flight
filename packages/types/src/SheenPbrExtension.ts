import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// KHR_materials_sheen: the grazing-angle retroreflective lobe used by cloth and fabric.
export interface SheenPbrExtension extends PbrExtension {
  readonly kind: 'SheenPbrExtension';
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer.
  sheenColor: number;
  sheenColorMap: Texture | null;
  sheenColorMapUvSet: PbrUvSet;
  sheenRoughness: number;
  sheenRoughnessMap: Texture | null;
  sheenRoughnessMapUvSet: PbrUvSet;
}

export const SheenPbrExtensionKind = 'SheenPbrExtension';
