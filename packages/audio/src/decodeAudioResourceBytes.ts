import type { AudioResource } from '@flighthq/types/contract';

import { getAudioDecoder } from './audioDecoderRegistry';
import { createAudioResource } from './audioResource';

// The one encoded-byte decode path for both public loaders and embedded references. A registered
// MIME-specific decoder wins; Web Audio remains the fallback when a context is available.
export async function decodeAudioResourceBytes(
  context: AudioContext | null,
  bytes: Uint8Array,
  mimeType: string | undefined,
  signal: AbortSignal,
): Promise<AudioResource | null> {
  signal.throwIfAborted();
  if (mimeType !== undefined) {
    const decoder = getAudioDecoder(mimeType);
    if (decoder !== null) {
      const resource = await decoder(bytes, mimeType, signal);
      signal.throwIfAborted();
      return resource;
    }
  }
  if (context === null) return null;

  // Copy the viewed region so decodeAudioData cannot detach the caller's Uint8Array.
  const buffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const audioBuffer = await context.decodeAudioData(buffer);
  // decodeAudioData cannot be cancelled, so an abort landing mid-decode must still suppress its result.
  signal.throwIfAborted();
  return createAudioResource(audioBuffer);
}
