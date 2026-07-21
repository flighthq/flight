import type { Scene } from '@flighthq/scene';
import { createSceneFrom3ds, parse3ds } from '@flighthq/scene-formats';
import type { SceneDocument } from '@flighthq/types';

import { createEmptySceneDocument, loadSceneDocumentBytes } from './loadSceneDocumentSource';
import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Fetches an Autodesk 3DS binary from a URL and parses it into a format-neutral SceneDocument. Fetches only
// the FILE — the document's texture refs stay unresolved; assemble with createSceneFromDocument and resolve
// on your own schedule with resolveSceneResources. On a fetch failure a warning is pushed and an empty
// document is returned.
export async function load3ds(url: string, warnings?: string[]): Promise<SceneDocument> {
  const bytes = await loadSceneDocumentBytes(url, 'load3ds', warnings);
  return bytes === null ? createEmptySceneDocument() : parse3ds(bytes, warnings);
}

// Parses an Autodesk 3DS binary into a Scene and resolves its material textures. The async sibling of
// createSceneFrom3ds.
export async function loadSceneFrom3ds(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFrom3ds(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
