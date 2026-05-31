import type { AudioSource } from '@flighthq/types';

let context: AudioContext | null = null;

export function createAudioSource(buffer?: AudioBuffer): AudioSource {
  return { buffer: buffer ?? null };
}

export function getAudioContext(): AudioContext {
  if (context === null) {
    context = new (getAudioContextConstructor())();
  }
  return context;
}

function getAudioContextConstructor(): typeof AudioContext {
  const ctor =
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (ctor === undefined) {
    throw new Error('AudioContext is not available.');
  }
  return ctor;
}
