import type { ConvolutionFilter } from '@flighthq/types';

export function createConvolutionFilter(options: Omit<ConvolutionFilter, 'kind'>): ConvolutionFilter {
  return { kind: 'ConvolutionFilter', ...options };
}
