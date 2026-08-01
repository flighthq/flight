import type { ImageEncodeFailureExplanation } from '@flighthq/types/contract';

import { getImageEncoder } from './imageEncoderRegistry';

// Explains the dispatcher failure that encodeImage represents with null. Returns null when an encoder
// is registered for the requested MIME type. This is a read-only query and never invokes the codec.
export function explainImageEncodeFailure(mimeType: string): ImageEncodeFailureExplanation | null {
  if (getImageEncoder(mimeType) !== null) return null;
  return { mimeType, reason: 'encoder-not-registered' };
}
