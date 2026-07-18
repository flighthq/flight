import type { Scene } from '@flighthq/scene';
import { createSceneFrom3ds } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parses an Autodesk 3DS binary into a Scene and resolves its material textures. The async sibling of
// createSceneFrom3ds. 3DS keyframe animation is not yet imported (see agents/morph-target-animation.md
// siblings / status), so there is no whole-file `load3ds` today — this is its complete loaded form.
export async function loadSceneFrom3ds(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFrom3ds(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
