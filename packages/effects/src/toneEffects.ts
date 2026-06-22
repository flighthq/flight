import type { BloomEffect, ExposureEffect, ToneMapEffect } from '@flighthq/types';

// HDR / tone-mapping effect intents and shared recipe math. The math here is substrate-agnostic so
// the Gl and Wgpu bloom recipes derive identical parameters from the same intent.

export function computeBloomBlurRadius(effect: Readonly<BloomEffect>): number {
  return Math.max(0, effect.radius ?? 8);
}

export function createBloomEffect(options: Readonly<Omit<BloomEffect, 'type'>> = {}): BloomEffect {
  return { type: 'bloom', ...options };
}

export function createExposureEffect(options: Readonly<Omit<ExposureEffect, 'type'>> = {}): ExposureEffect {
  return { type: 'exposure', ...options };
}

export function createToneMapEffect(options: Readonly<Omit<ToneMapEffect, 'type'>> = {}): ToneMapEffect {
  return { type: 'toneMap', ...options };
}
