import type { Scene } from '@flighthq/scene';
import { createSceneFromAwd } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parse-and-resolve convenience over @flighthq/scene-formats: parses AWD bytes into a Scene (geometry
// plus its folded skeleton animation), then resolves all pending texture resources eagerly, returning
// the fully-resolved scene. When no resolver is supplied a private one is created and disposed after the
// load; a supplied resolver is left open for the caller to keep driving or dispose.
export async function loadSceneFromAwd(bytes: Uint8Array, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromAwd(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
