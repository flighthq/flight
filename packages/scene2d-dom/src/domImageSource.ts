import type { Bitmap } from '@flighthq/bitmap/contract';
import type { ImageResource } from '@flighthq/image/contract';
import { BitmapTextureSourceKind } from '@flighthq/texture/contract';

import type { DomImageSourceKind } from './contract.scene2d-dom-types.ts';

// Reports whether DOM can use a source directly or must materialize its bytes. The query never
// performs the conversion; registerDomBitmapTextureResolver is the explicit opt-in that does.
export function explainDomImageSource(image: Readonly<ImageResource> | Readonly<Bitmap>): DomImageSourceKind {
  if (image.kind === BitmapTextureSourceKind) return 'data';
  return 'element';
}
