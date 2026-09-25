import type { HostAudioDecodeCapabilities, HostAudioDecodeFormatCapability } from '@flighthq/types/contract';

import { getAudioMimeTypeEssence } from './audioFormat.ts';

// Maps a container's MIME type onto the host slot that decodes it, and answers whether anything can.
// The mapping lives here rather than in the header because it is a fact about MIME registrations rather
// than about what a host provides: `audio/mpeg` and `audio/mp3` are the same codec under two names a
// caller may legitimately hand us, and the slot set does not grow when a new spelling appears.

// The slot for this MIME type, or null when the type is outside the standard set or the host left the
// slot empty. The two are deliberately one answer: from the decode path's side, a format nothing can
// read and a format nobody supplied a reader for lead to the same place.
export function getAudioDecodeSlot(
  audioDecode: Readonly<HostAudioDecodeCapabilities>,
  mimeType: string,
): HostAudioDecodeFormatCapability | null {
  switch (getAudioMimeTypeEssence(mimeType)) {
    case 'audio/aac':
    case 'audio/aacp':
      return audioDecode.aac ?? null;
    case 'audio/flac':
    case 'audio/x-flac':
      return audioDecode.flac ?? null;
    case 'audio/mpeg':
    case 'audio/mp3':
    case 'audio/mpeg3':
    case 'audio/x-mpeg':
      return audioDecode.mp3 ?? null;
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
      return audioDecode.mp4 ?? null;
    case 'audio/ogg':
    case 'audio/vorbis':
    case 'application/ogg':
      return audioDecode.ogg ?? null;
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
    case 'audio/vnd.wave':
      return audioDecode.wav ?? null;
    case 'audio/webm':
      return audioDecode.webm ?? null;
    default:
      return null;
  }
}

export function hasAudioDecodeSlot(audioDecode: Readonly<HostAudioDecodeCapabilities>, mimeType: string): boolean {
  return getAudioDecodeSlot(audioDecode, mimeType) !== null;
}
