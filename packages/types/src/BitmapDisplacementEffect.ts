import type { ImageChannel } from './ImageChannel';
import type { RenderEffect } from './RenderEffect';
import type { Texture2D } from './Texture';

export type BitmapDisplacementEffectEdgeMode = 'clamp' | 'wrap';

// Warps the source image with channel data from a sampleable 2D displacement map. This is distinct
// from DisplacementEffect, whose map is a procedural animated sine field. A Bitmap source participates
// by sitting behind a Texture2D view, so backend upload/caching still goes through the normal texture
// resolver. Displacement maps are data rather than colour; callers should declare the map Texture2D's
// colorSpace as 'linear' so a linear render target does not sRGB-decode the channel values.
export interface BitmapDisplacementEffect extends RenderEffect {
  kind: 'BitmapDisplacementEffect';
  // Null is the explicit not-loaded sentinel. A backend copies the source through and exposes the
  // unresolved state through its effect-resolution query rather than sampling an arbitrary stand-in.
  map: Readonly<Texture2D> | null;
  // Channel indices use ImageChannel (Red=0, Green=1, Blue=2, Alpha=3). Defaults Red / Green.
  componentX?: ImageChannel;
  componentY?: ImageChannel;
  // Source-sampling displacement in pixels. Channel value 0.5 is neutral. Defaults 0 / 0.
  scaleX?: number;
  scaleY?: number;
  // Clamp holds the source edge; wrap tiles source coordinates. Default wrap.
  edgeMode?: BitmapDisplacementEffectEdgeMode;
}
