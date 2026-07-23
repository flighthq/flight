import { parseMd2 } from '@flighthq/scene-formats';
import type { SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';

import { loadSceneDocumentBytesFromUrl, setSceneDocumentResourceBasePathFromUrl } from './loadSceneDocumentSource';

// Fetches an id Software MD2 (Quake 2) model from a URL and parses it into a format-neutral SceneDocument
// (a morph-animated mesh). Fetches only the FILE — the document's skin texture ref stays unresolved;
// assemble with createSceneFromDocument and resolve on your own schedule. Returns null on transport failure;
// it never creates a renderer or GPU resource.
export async function loadSceneDocumentFromMd2Url(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const bytes = await loadSceneDocumentBytesFromUrl(url, options);
  if (bytes === null) return null;
  const document = parseMd2(bytes);
  setSceneDocumentResourceBasePathFromUrl(document, url);
  return document;
}
