import type {
  AudioDecoderRegistry,
  AudioResource,
  HostAudioDecodeCapabilities,
  HostAudioDecodeFormatCapability,
} from '@flighthq/types/contract';

import { getAudioDecodeSlot } from './audioDecodeSlot';
import { detectAudioMimeType, getAudioMimeTypeEssence } from './audioFormat';
import { createAudioResource } from './audioResource';

// The one encoded-byte decode path for both public loaders and embedded references.
//
// Order is caller-owned decoders first, then the host's standard slots. That is not a preference between
// two equal things: a caller-supplied decoder exists precisely because the platform cannot read that
// format, and letting the host try first would hand a SWF ADPCM payload to a codec that will reject it.
// A caller who wants to override a standard container does so by naming it in their own registry, which
// is the only way to override anything here — there is no ambient state to write into.
export async function decodeAudioResourceBytes(
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  bytes: Uint8Array,
  mimeType: string | undefined,
  signal: AbortSignal,
  decoders?: AudioDecoderRegistry,
): Promise<AudioResource | null> {
  signal.throwIfAborted();
  if (mimeType !== undefined && decoders !== undefined) {
    const decoder = decoders.get(getAudioMimeTypeEssence(mimeType));
    if (decoder !== undefined) {
      const resource = await decoder(bytes, mimeType, signal);
      signal.throwIfAborted();
      return resource;
    }
  }
  const slot = resolveAudioDecodeSlot(audioDecode, bytes, mimeType);
  if (slot === null) return null;
  const buffer = await slot.decode(bytes, signal);
  // A host decode is usually uncancellable once begun, so an abort landing mid-decode has to suppress the
  // result here rather than being trusted to have stopped it.
  signal.throwIfAborted();
  return buffer === null ? null : createAudioResource(buffer);
}

// The declared type first, then the bytes themselves. Sniffing is not a nicety: a platform decoder reads
// the container rather than the label, so a payload served with no `content-type`, or with one no slot
// claims, still decoded before this group existed. Resolving it from the magic bytes keeps that working
// without asking any host to guess.
function resolveAudioDecodeSlot(
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  bytes: Readonly<Uint8Array>,
  mimeType: string | undefined,
): HostAudioDecodeFormatCapability | null {
  if (mimeType !== undefined) {
    const declared = getAudioDecodeSlot(audioDecode, mimeType);
    if (declared !== null) return declared;
  }
  const detected = detectAudioMimeType(bytes as Uint8Array);
  return detected === null ? null : getAudioDecodeSlot(audioDecode, detected);
}
