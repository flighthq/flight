import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Lighting-independent flat color. `baseColor` is packed sRgb-albedo RGBA; `baseColorMap`
// tints it from any registered backing: still image, live video host handle, or render target.
// The backend resolver decides whether to upload CPU-origin pixels or return a GPU-origin
// attachment; the material has one sampling slot.
export interface UnlitMaterial extends SurfaceMaterial {
  readonly kind: typeof UnlitMaterialKind;
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer.
  baseColor: number;
  baseColorMap: Texture | null;
}

export const UnlitMaterialKind = 'UnlitMaterial';
