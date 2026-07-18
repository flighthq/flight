import type { Scene } from '@flighthq/scene';
import { createSceneFromGlb, createSceneFromGltf, importGlb, importGltf } from '@flighthq/scene-formats';
import type { GltfDocument, SceneImport } from '@flighthq/scene-formats';

import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Whole-file import of a binary glTF (`.glb`) with its textures resolved: every scene + every animation
// clip, images fetched/decoded. The async sibling of importGlb.
export async function loadGlb(bytes: Readonly<Uint8Array>, options?: Readonly<LoadSceneOptions>): Promise<SceneImport> {
  const result = importGlb(bytes);
  await resolveScenesWithOptions(result.scenes, options);
  return result;
}

// Whole-file import of a glTF document with its textures resolved: `{ scene, scenes, animations }` with
// every image fetched/decoded. The async sibling of importGltf. Animations pass through untouched.
export async function loadGltf(
  source: GltfDocument | string,
  options?: Readonly<LoadSceneOptions>,
): Promise<SceneImport> {
  const result = importGltf(source);
  await resolveScenesWithOptions(result.scenes, options);
  return result;
}

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
