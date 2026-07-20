import type { Scene } from '@flighthq/scene';
import {
  createSceneFromGlb,
  createSceneFromGltf,
  createScenesFromGlb,
  createScenesFromGltf,
} from '@flighthq/scene-formats';
import type { GltfDocument } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Parses a binary glTF (`.glb`) into its default Scene and resolves the scene's textures. The async
// sibling of createSceneFromGlb.
export async function loadSceneFromGlb(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromGlb(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}

// Parses a glTF document into its default Scene and resolves the scene's textures. The async sibling of
// createSceneFromGltf.
export async function loadSceneFromGltf(
  source: GltfDocument | string,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromGltf(source);
  await resolveScenesWithOptions([scene], options);
  return scene;
}

// Parses a binary glTF (`.glb`) into every scene it declares (each a document carrying its geometry, with
// the file's animation clips on the default scene) and resolves their textures. The async sibling of
// createScenesFromGlb.
export async function loadScenesFromGlb(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene[]> {
  const scenes = createScenesFromGlb(bytes);
  await resolveScenesWithOptions(scenes, options);
  return scenes;
}

// Parses a glTF document into every scene it declares and resolves their textures. The async sibling of
// createScenesFromGltf.
export async function loadScenesFromGltf(
  source: GltfDocument | string,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene[]> {
  const scenes = createScenesFromGltf(source);
  await resolveScenesWithOptions(scenes, options);
  return scenes;
}
