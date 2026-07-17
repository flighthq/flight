import type { Scene } from '@flighthq/scene';
import { createSceneFromAwd } from '@flighthq/scene-formats';

import { resolveSceneResourcesAndWait } from './resolveSceneResourcesAndWait';
import type { SceneResourceResolver } from './sceneResourceResolver';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

export interface LoadSceneOptions {
  // Reuse a caller-owned resolver (shared registry/fetch/loader); omit it and a private resolver is
  // created for this load and disposed when the scene is fully resolved.
  resolver?: SceneResourceResolver;
}

// Parse-and-resolve convenience over @flighthq/scene-formats: parses AWD bytes into a Scene, then
// resolves all pending texture resources eagerly, returning the fully-resolved scene. When no
// resolver is supplied a private one is created and disposed after the load; a supplied resolver is
// left open for the caller to keep driving or dispose.
export async function loadSceneFromAwd(bytes: Uint8Array, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromAwd(bytes);
  const resolver = options?.resolver ?? createSceneResourceResolver();
  try {
    await resolveSceneResourcesAndWait(scene, resolver);
  } finally {
    if (options?.resolver === undefined) disposeSceneResourceResolver(resolver);
  }
  return scene;
}
