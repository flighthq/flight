import type { AudioDecoder } from '@flighthq/types/contract';

import { getAudioMimeTypeEssence } from './audioFormat';

export function getAudioDecoder(mimeType: string): AudioDecoder | null {
  return decoders.get(getAudioMimeTypeEssence(mimeType)) ?? null;
}

// Returns an insertion-ordered snapshot of the MIME types with registered decoders. Mutating the returned
// array cannot change registry state.
export function getAudioDecoderMimeTypes(): readonly string[] {
  return Array.from(decoders.keys());
}

export function hasAudioDecoder(mimeType: string): boolean {
  return decoders.has(getAudioMimeTypeEssence(mimeType));
}

export function registerAudioDecoder(mimeType: string, decoder: AudioDecoder): void {
  decoders.set(getAudioMimeTypeEssence(mimeType), decoder);
}

export function unregisterAudioDecoder(mimeType: string): void {
  decoders.delete(getAudioMimeTypeEssence(mimeType));
}

// Global MIME-keyed decoder registry, mirroring the image one. Empty at import — only register* populates
// it, so importing this package has no side effects. Last-write-wins, so a host can override a decoder by
// registering after the default one.
//
// This registry is for formats the platform cannot decode on its own. Anything the browser understands
// (MP3, WAV, Ogg) needs no entry: the resolver falls through to the platform decoder, which content-sniffs.
// Registering here is how a SWF ADPCM or Nellymoser decoder becomes reachable without this package, or the
// resolver, knowing that those formats exist.
const decoders = new Map<string, AudioDecoder>();
