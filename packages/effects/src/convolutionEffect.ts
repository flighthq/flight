import type { ConvolutionEffect } from '@flighthq/types';

export function createConvolutionEffect(options: Readonly<Omit<ConvolutionEffect, 'kind'>>): ConvolutionEffect {
  return { kind: 'ConvolutionEffect', ...options };
}
