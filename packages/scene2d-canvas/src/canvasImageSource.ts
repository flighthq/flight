import type { Bitmap, CanvasImageSourceKind, ImageResource } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

// Reports whether Canvas can draw a source directly or must materialize its bytes. The query never
// performs the conversion; registerCanvasBitmapTextureResolver is the explicit opt-in that does.
export function explainCanvasImageSource(image: Readonly<ImageResource> | Readonly<Bitmap>): CanvasImageSourceKind {
  if (image.kind === BitmapTextureSourceKind) return 'data';
  return 'element';
}
