import { parseAwd } from '@flighthq/scene-formats';
import type { SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';

import { loadSceneDocumentBytesFromUrl, setSceneDocumentResourceBasePathFromUrl } from './loadSceneDocumentSource';

// Fetches an Away3D AWD file from a URL and parses it into a format-neutral SceneDocument (geometry, skins,
// and its skeleton animation). Fetches only the FILE — the document's texture refs stay unresolved; assemble
// with createSceneFromDocument and resolve on your own schedule with resolveSceneResources. On a fetch
// failure returns null; it never creates a renderer or GPU resource.
export async function loadSceneDocumentFromAwdUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const bytes = await loadSceneDocumentBytesFromUrl(url, options);
  if (bytes === null) return null;
  const document = parseAwd(bytes);
  setSceneDocumentResourceBasePathFromUrl(document, url);
  return document;
}
