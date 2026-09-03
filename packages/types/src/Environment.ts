import type { Light } from './Light';
import type { Texture } from './Texture';

// Image-based environment lighting + skybox source. `environment` is the radiance cubemap used
// for the skybox and as the IBL specular/irradiance source; `intensity` scales its contribution.
export interface Environment extends Light {
  enabled: boolean;
  environment: Texture | null;
  intensity: number;
  kind: 'Environment';
}

export const EnvironmentKind = 'Environment';
