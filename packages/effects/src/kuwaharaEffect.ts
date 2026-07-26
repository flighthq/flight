import type { KuwaharaEffect } from '@flighthq/types/contract';

export function createKuwaharaEffect(options: Readonly<Omit<KuwaharaEffect, 'kind'>> = {}): KuwaharaEffect {
  return { kind: 'KuwaharaEffect', ...options };
}
