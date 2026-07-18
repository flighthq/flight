import type { Scene } from '@flighthq/scene';
import { createSceneFromMd2 } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parses an id Software MD2 (Quake 2) model into a Scene and resolves its skin texture. The async
// sibling of createSceneFromMd2. MD2's animation is vertex-morph (deferred — see the morph-target
// charter), so there is no whole-file `loadMd2` today; this is its complete loaded form.
export async function loadSceneFromMd2(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromMd2(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
