import type { ParticleEmitterConfig } from '@flighthq/types/contract';

export interface ParticleConfigIssue {
  field: keyof ParticleEmitterConfig;
  message: string;
  severity: 'error' | 'warning';
}
