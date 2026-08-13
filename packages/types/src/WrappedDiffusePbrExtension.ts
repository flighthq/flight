import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// Flight-specific wrapped diffuse contribution. This is deliberately not named "subsurface": it
// widens direct diffuse lighting around the terminator but does not model subsurface transport.
export interface WrappedDiffusePbrExtension extends PbrExtension {
  readonly kind: 'WrappedDiffusePbrExtension';
  thickness: number;
  thicknessMap: Texture | null;
  thicknessMapUvSet: PbrUvSet;
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer.
  wrappedDiffuseColor: number;
  wrappedDiffuseMap: Texture | null;
  wrappedDiffuseMapUvSet: PbrUvSet;
  wrappedDiffuseStrength: number;
}

export const WrappedDiffusePbrExtensionKind = 'WrappedDiffusePbrExtension';
