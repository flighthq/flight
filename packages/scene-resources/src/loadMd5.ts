import type { Scene } from '@flighthq/scene';
import { createSceneFromMd5Mesh } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parses an MD5 mesh (`.md5mesh`) into a Scene (mesh + skeleton) and resolves its shader textures. The async
// sibling of createSceneFromMd5Mesh. A paired `.md5anim` is a separate file: parse it with parseMd5Anim
// against `findSceneSkeletonJoints(scene.root)` and assign the clip into `scene.animations` under an action
// name.
export async function loadSceneFromMd5Mesh(meshSource: string, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromMd5Mesh(meshSource);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
