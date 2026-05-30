import type { AudioSource } from '@flighthq/types';

export function createAudioSource(element?: HTMLAudioElement): AudioSource {
  return { src: element ?? null };
}

export function playAudioSource(source: AudioSource): void {
  if (source.src === null) return;
  (source.src.cloneNode(true) as HTMLAudioElement).play().catch(() => {});
}
