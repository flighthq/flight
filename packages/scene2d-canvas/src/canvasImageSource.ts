import type { Bitmap, CanvasImageSourceKind, ImageResource } from '@flighthq/types/contract';
import { BitmapTextureBackingKind } from '@flighthq/types/contract';

// Reports whether Canvas can draw a backing directly or must materialize its bytes. The query never
// performs the conversion; registerCanvasBitmapTextureResolver is the explicit opt-in that does.
export function explainCanvasImageSource(image: Readonly<ImageResource> | Readonly<Bitmap>): CanvasImageSourceKind {
  if (image.kind === BitmapTextureBackingKind) return 'data';
  return 'element';
}
