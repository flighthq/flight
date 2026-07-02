import type { BloomEffect } from '@flighthq/types';

// HDR bloom intent and its shared recipe math. The parameter math is substrate-agnostic so the Gl and
// Wgpu bloom recipes derive identical bright-pass cutoff, additive strength, and blur radius from the
// same intent.

export function computeBloomBlurRadius(effect: Readonly<BloomEffect>): number {
  return Math.max(0, effect.radius ?? 8);
}

export function computeBloomIntensity(effect: Readonly<BloomEffect>): number {
  return effect.intensity ?? 1;
}

export function computeBloomThreshold(effect: Readonly<BloomEffect>): number {
  return effect.threshold ?? 0.8;
}

export function createBloomEffect(options: Readonly<Omit<BloomEffect, 'kind'>> = {}): BloomEffect {
  return { kind: 'BloomEffect', ...options };
}
