import type { Texture } from './Texture';

export interface EnvironmentOptions {
  environment?: Texture | null;
  intensity?: number;
}
