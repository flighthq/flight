import type { Bitmap } from './Bitmap';
import type { DecodedImage } from './DecodedImage';

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
