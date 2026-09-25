import type { Texture } from './Texture.ts';

export interface EnvironmentOptions {
  enabled?: boolean;
  environment?: Texture | null;
  intensity?: number;
}
