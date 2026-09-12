import type { Bitmap } from './Bitmap';
import type { DecodedImage } from './DecodedImage';
import type { EmbeddedImageResourceReference } from './ImageResourceReference';

// Plain data selecting an explicitly registered pixel composer. `payload` belongs to the producer that
// declared `kind`; the shared image lane only carries it to that composer after ordinary MIME decoding.
// A producer that owns raw pixels rather than an encoded image may compose from the payload alone when
// `decoded` is null. Keeping the callback in the registry leaves resource references serializable.
export interface ImageBitmapComposition {
  kind: string;
  payload: Uint8Array;
}

export type ImageBitmapComposer = (
  decoded: Readonly<DecodedImage> | null,
  payload: Readonly<Uint8Array>,
) => Bitmap | null;

// The optional decoded-pixel join installed into reference resolution. It stands between an embedded
// reference that names a composer and the Bitmap that composer produces; @flighthq/image holds the slot
// and knows nothing about which composers exist.
export type ImageBitmapCompositionResolver = (
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
) => Promise<Bitmap | null>;
