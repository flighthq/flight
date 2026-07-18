import type { Scene } from '@flighthq/scene';
import { createSceneFromAwd, importAwd } from '@flighthq/scene-formats';
import type { SceneImport } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// The whole-file sibling of loadSceneFromAwd: imports AWD as a SceneImport (scene + skeleton animation)
// and resolves its textures. Animations pass through untouched — a clip is plain node-bound data with
// nothing to fetch; only the scene's textures resolve.
export async function loadAwd(bytes: Uint8Array, options?: Readonly<LoadSceneOptions>): Promise<SceneImport> {
  const result = importAwd(bytes);
  await resolveScenesWithOptions(result.scenes, options);
  return result;
}

// Parse-and-resolve convenience over @flighthq/scene-formats: parses AWD bytes into a Scene, then
// resolves all pending texture resources eagerly, returning the fully-resolved scene. When no
// resolver is supplied a private one is created and disposed after the load; a supplied resolver is
// left open for the caller to keep driving or dispose.
export async function loadSceneFromAwd(bytes: Uint8Array, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromAwd(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
