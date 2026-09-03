import type { Texture } from './Texture';

export interface EnvironmentOptions {
  enabled?: boolean;
  environment?: Texture | null;
  intensity?: number;
}
