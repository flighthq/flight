import type { Scene } from '@flighthq/scene';
import {
  createSceneFromGlb,
  createSceneFromGltf,
  createScenesFromGlb,
  createScenesFromGltf,
  parseGlb,
  parseGltf,
} from '@flighthq/scene-formats';
import type { GltfDocument } from '@flighthq/scene-formats';
import type { SceneDocument } from '@flighthq/types';

import { createEmptySceneDocument, loadSceneDocumentBytes, loadSceneDocumentText } from './loadSceneDocumentSource';
import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Fetches a binary glTF (`.glb`) from a URL and parses it into a format-neutral SceneDocument. Fetches only
// the FILE — the document's texture refs stay unresolved; assemble with createSceneFromDocument and resolve
// on your own schedule with resolveSceneResources. On a fetch failure a warning is pushed and an empty
// document is returned.
export async function loadGlb(url: string, warnings?: string[]): Promise<SceneDocument> {
  const bytes = await loadSceneDocumentBytes(url, 'loadGlb', warnings);
  return bytes === null ? createEmptySceneDocument() : parseGlb(bytes, warnings);
}

// Fetches a glTF file from a URL and parses it into a format-neutral SceneDocument. The JSON `.gltf` form is
// fetched as text (its external `.bin`/image URIs stay unresolved refs). Fetches only the FILE — no texture
// resolution; assemble with createSceneFromDocument and resolve explicitly. On a fetch failure a warning is
// pushed and an empty document is returned.
export async function loadGltf(url: string, warnings?: string[]): Promise<SceneDocument> {
  const source = await loadSceneDocumentText(url, 'loadGltf', warnings);
  return source === null ? createEmptySceneDocument() : parseGltf(source, warnings);
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
