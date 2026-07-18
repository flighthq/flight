import type { Scene } from '@flighthq/scene';
import { createSceneFromMd5Mesh, importMd5Mesh } from '@flighthq/scene-formats';
import type { SceneImport } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Whole-file MD5 import with textures resolved: the mesh scene (skeleton + skinned meshes) plus, when
// the paired `.md5anim` source is supplied, its skeletal animation. The async sibling of importMd5Mesh.
// The animation passes through untouched; only the scene's shader textures resolve.
export async function loadMd5(
  meshSource: string,
  animSource?: string,
  options?: Readonly<LoadSceneOptions>,
): Promise<SceneImport> {
  const result = importMd5Mesh(meshSource, animSource);
  await resolveScenesWithOptions(result.scenes, options);
  return result;
}

// Parses an MD5 mesh (`.md5mesh`) into a Scene and resolves its shader textures. The async sibling of
// createSceneFromMd5Mesh.
export async function loadSceneFromMd5Mesh(meshSource: string, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromMd5Mesh(meshSource);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
