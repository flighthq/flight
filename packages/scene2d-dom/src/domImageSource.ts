import type { Bitmap, DomImageSourceKind, ImageResource } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

// Reports whether DOM can use a source directly or must materialize its bytes. The query never
// performs the conversion; registerDomBitmapTextureResolver is the explicit opt-in that does.
export function explainDomImageSource(image: Readonly<ImageResource> | Readonly<Bitmap>): DomImageSourceKind {
  if (image.kind === BitmapTextureSourceKind) return 'data';
  return 'element';
}
