import type { AudioResource } from '@flighthq/types';

export function createAudioResource(buffer?: AudioBuffer): AudioResource {
  return { buffer: buffer ?? null };
}
