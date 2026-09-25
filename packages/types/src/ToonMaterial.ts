import type { Material3D } from './Material3D.ts';
import type { Texture } from './Texture.ts';

// Cel shading: diffuse N·L is quantized through a 1D `ramp` texture into stepped bands.
// `baseColor` is packed sRgb-albedo RGBA, `baseColorMap` tints it, and `steps` is the band
// count used when no ramp is bound.
export interface ToonMaterial extends Material3D {
  readonly kind: typeof ToonMaterialKind;
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer.
  baseColor: number;
  baseColorMap: Texture | null;
  ramp: Texture | null;
  steps: number;
}

export const ToonMaterialKind = 'ToonMaterial';
