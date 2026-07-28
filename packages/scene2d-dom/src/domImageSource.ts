import type { Bitmap, DomImageSourceKind, ImageResource } from '@flighthq/types/contract';
import { BitmapTextureBackingKind } from '@flighthq/types/contract';

// Reports whether DOM can use a backing directly or must materialize its bytes. The query never
// performs the conversion; registerDomBitmapTextureResolver is the explicit opt-in that does.
export function explainDomImageSource(image: Readonly<ImageResource> | Readonly<Bitmap>): DomImageSourceKind {
  if (image.kind === BitmapTextureBackingKind) return 'data';
  return 'element';
}
