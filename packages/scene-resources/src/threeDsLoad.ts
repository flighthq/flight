import { parse3ds } from '@flighthq/scene-formats';
import type { SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';

import { loadSceneDocumentBytesFromUrl, setSceneDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches an Autodesk 3DS binary from a URL and parses it into a format-neutral SceneDocument. Fetches only
// the FILE — the document's texture refs stay unresolved; assemble with createSceneFromDocument and resolve
// on your own schedule. Returns null on transport failure; it never creates a renderer or GPU resource.
export async function loadSceneDocumentFrom3dsUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const bytes = await loadSceneDocumentBytesFromUrl(url, options);
  if (bytes === null) return null;
  const document = parse3ds(bytes);
  setSceneDocumentResourceBasePathFromUrl(document, url);
  return document;
}
