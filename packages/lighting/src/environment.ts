import { createEntity } from '@flighthq/entity';
import type { Environment, EnvironmentOptions } from '@flighthq/types';
import { EnvironmentKind } from '@flighthq/types';

// Independent copy of the environment's data. The `environment` cubemap reference is shared, not
// deep-copied: a CubeTexture is a GPU-backed resource, so the copy aliases the same source.
export function cloneEnvironment(source: Readonly<Environment>): Environment {
  return createEnvironment({ environment: source.environment, intensity: source.intensity });
}

// Image-based environment lighting + skybox source. `environment` is the radiance cubemap used
// for the skybox and as the IBL specular/irradiance source; `intensity` scales its contribution.
// Defaults to no cubemap (null) at unit intensity.
export function createEnvironment(options?: Readonly<EnvironmentOptions>): Environment {
  return createEntity({
    environment: options?.environment ?? null,
    intensity: options?.intensity ?? 1,
    kind: EnvironmentKind,
  });
}
