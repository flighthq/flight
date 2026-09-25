import type { ParticleEmitterConfig } from './ParticleEmitterConfig.ts';

export interface ParticleConfigIssue {
  field: keyof ParticleEmitterConfig;
  message: string;
  severity: 'error' | 'warning';
}
