import type { BloomEffect } from '@flighthq/types';

// HDR bloom intent and its shared recipe math. The radius math is substrate-agnostic so the Gl and
// Wgpu bloom recipes derive identical parameters from the same intent.

export function computeBloomBlurRadius(effect: Readonly<BloomEffect>): number {
  return Math.max(0, effect.radius ?? 8);
}

export function createBloomEffect(options: Readonly<Omit<BloomEffect, 'kind'>> = {}): BloomEffect {
  return { kind: 'BloomEffect', ...options };
}
