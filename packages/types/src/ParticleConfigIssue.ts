import type { ParticleEmitterConfig } from './ParticleEmitterConfig';

export interface ParticleConfigIssue {
  field: keyof ParticleEmitterConfig;
  message: string;
  severity: 'error' | 'warning';
}
