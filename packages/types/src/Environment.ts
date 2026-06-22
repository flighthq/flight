import type { CubeTexture } from './CubeTexture';
import type { Light } from './Light';

// Image-based environment lighting + skybox source. `environment` is the radiance cubemap used
// for the skybox and as the IBL specular/irradiance source; `intensity` scales its contribution.
export interface Environment extends Light {
  environment: CubeTexture | null;
  intensity: number;
  kind: 'Environment';
}

export const EnvironmentKind = 'Environment';
