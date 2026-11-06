import type { ParticleEmitterConfig } from '@flighthq/particles/contract';

export interface ParticleConfigIssue {
  field: keyof ParticleEmitterConfig;
  message: string;
  severity: 'error' | 'warning';
}
