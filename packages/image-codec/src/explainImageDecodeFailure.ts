import type { ImageDecodeFailureExplanation } from '@flighthq/types/contract';

import { detectImageMimeType } from './detectImageMimeType';
import { getImageDecoder } from './imageDecoderRegistry';

// Explains the two dispatcher failures that decodeImage represents with null. Returns null when the
// same request can reach a registered decoder. This is a read-only query and never invokes the codec.
export function explainImageDecodeFailure(
  bytes: Readonly<Uint8Array>,
  mimeType?: string,
): ImageDecodeFailureExplanation | null {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) return { mimeType: null, reason: 'mime-type-undetected' };
  if (getImageDecoder(type) === null) return { mimeType: type, reason: 'decoder-not-registered' };
  return null;
}
