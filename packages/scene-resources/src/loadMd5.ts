import type { Scene } from '@flighthq/scene';
import { createSceneFromMd5Mesh } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parses an MD5 mesh (`.md5mesh`) into a Scene and resolves its shader textures. When the paired
// `.md5anim` source is supplied, its skeletal animation is folded onto the scene. The async sibling of
// createSceneFromMd5Mesh.
export async function loadSceneFromMd5Mesh(
  meshSource: string,
  animSource?: string,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromMd5Mesh(meshSource, animSource);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
