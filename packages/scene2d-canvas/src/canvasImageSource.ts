import type { Bitmap } from '@flighthq/bitmap/contract';
import type { ImageResource } from '@flighthq/image/contract';
import { BitmapTextureSourceKind } from '@flighthq/texture/contract';

import type { CanvasImageSourceKind } from './contract.scene2d-canvas-types.ts';

// Reports whether Canvas can draw a source directly or must materialize its bytes. The query never
// performs the conversion; registerCanvasBitmapTextureResolver is the explicit opt-in that does.
export function explainCanvasImageSource(image: Readonly<ImageResource> | Readonly<Bitmap>): CanvasImageSourceKind {
  if (image.kind === BitmapTextureSourceKind) return 'data';
  return 'element';
}
