import type { Scene } from '@flighthq/scene';
import { createSceneFromObj } from '@flighthq/scene-formats';
import type { ObjMaterialLibrary } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parses a Wavefront OBJ (with an optional parsed MTL library) into a Scene and resolves the material
// textures the library referenced. The async sibling of createSceneFromObj. OBJ carries no animation,
// so there is no whole-file `loadObj` — this is its complete loaded form.
export async function loadSceneFromObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromObj(source, materials);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
