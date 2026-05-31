import type { AudioSource } from '@flighthq/types';

let context: AudioContext | null = null;

export function createAudioSource(buffer?: AudioBuffer): AudioSource {
  return { src: buffer ?? null };
}

export function getAudioContext(): AudioContext {
  if (context === null) {
    context = new AudioContext();
  }
  return context;
}

export function playAudioSource(source: AudioSource): void {
  if (source.src === null) return;
  const ctx = getAudioContext();
  const node = ctx.createBufferSource();
  node.buffer = source.src;
  node.connect(ctx.destination);
  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(() => node.start())
      .catch(() => {});
  } else {
    node.start();
  }
}
