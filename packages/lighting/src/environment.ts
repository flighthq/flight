import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Environment, EnvironmentOptions } from '@flighthq/types/contract';
import { EnvironmentKind } from '@flighthq/types/contract';

// Independent copy of the environment's data. The `environment` cubemap reference is shared, not
// deep-copied: a Texture is a GPU-backed resource, so the copy aliases the same source.
export function cloneEnvironment(source: Readonly<Environment>): Environment {
  return createEnvironment({ enabled: source.enabled, environment: source.environment, intensity: source.intensity });
}

// Image-based environment lighting + skybox source. `environment` is the radiance cubemap used
// for the skybox and as the IBL specular/irradiance source; `intensity` scales its contribution.
// Defaults to no cubemap (null) at unit intensity.
export function createEnvironment(options?: Readonly<EnvironmentOptions>): Environment {
  const out = allocateEntity<Environment>();
  out.enabled = options?.enabled ?? true;
  out.environment = options?.environment ?? null;
  out.intensity = options?.intensity ?? 1;
  out.kind = EnvironmentKind;
  return finishEntity(out);
}
