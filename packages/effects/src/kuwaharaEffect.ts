import { createEntity } from '@flighthq/entity/contract';
import type { KuwaharaEffect } from '@flighthq/types/contract';

export function createKuwaharaEffect(options: Readonly<Omit<KuwaharaEffect, 'kind'>> = {}): KuwaharaEffect {
  return createEntity({ kind: 'KuwaharaEffect', ...options });
}
