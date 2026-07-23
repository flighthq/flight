import { parseMd5Mesh } from '@flighthq/scene-formats';
import type { SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';

import { loadSceneDocumentTextFromUrl, setSceneDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches an MD5 mesh file (`.md5mesh`) from a URL and parses it into a format-neutral SceneDocument (mesh +
// skeleton). Fetches only the mesh FILE — a paired `.md5anim` is a separate file, and the document's shader
// texture refs stay unresolved; assemble with createSceneFromDocument and resolve on your own schedule with
// loadSceneResources. Returns null on transport failure; it never creates a renderer or GPU resource.
export async function loadSceneDocumentFromMd5MeshUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const source = await loadSceneDocumentTextFromUrl(url, options);
  if (source === null) return null;
  const document = parseMd5Mesh(source);
  setSceneDocumentResourceBasePathFromUrl(document, url);
  return document;
}
