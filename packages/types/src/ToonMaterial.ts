import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Cel shading: diffuse N·L is quantized through a 1D `ramp` texture into stepped bands.
// `baseColor` is packed sRgb-albedo RGBA, `baseColorMap` tints it, and `steps` is the band
// count used when no ramp is bound.
export interface ToonMaterial extends SurfaceMaterial {
  baseColor: number;
  baseColorMap: Texture | null;
  ramp: Texture | null;
  steps: number;
}

export const ToonMaterialKind: unique symbol = Symbol('ToonMaterial');
