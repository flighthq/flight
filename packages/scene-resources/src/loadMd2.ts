import type { Scene } from '@flighthq/scene';
import { createSceneFromMd2, parseMd2 } from '@flighthq/scene-formats';
import type { SceneDocument } from '@flighthq/types';

import { createEmptySceneDocument, loadSceneDocumentBytes } from './loadSceneDocumentSource';
import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Fetches an id Software MD2 (Quake 2) model from a URL and parses it into a format-neutral SceneDocument
// (a morph-animated mesh). Fetches only the FILE — the document's skin texture ref stays unresolved;
// assemble with createSceneFromDocument and resolve on your own schedule with resolveSceneResources. On a
// fetch failure a warning is pushed and an empty document is returned.
export async function loadMd2(url: string, warnings?: string[]): Promise<SceneDocument> {
  const bytes = await loadSceneDocumentBytes(url, 'loadMd2', warnings);
  return bytes === null ? createEmptySceneDocument() : parseMd2(bytes, warnings);
}

// Parses an id Software MD2 (Quake 2) model into a Scene and resolves its skin texture. The async
// sibling of createSceneFromMd2.
export async function loadSceneFromMd2(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromMd2(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
