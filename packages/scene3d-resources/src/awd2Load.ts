import { parseAwd2 } from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, Scene3DDocument, Scene3DDocumentLoadOptions } from '@flighthq/types/contract';

import { loadScene3DDocumentBytesFromUrl, setScene3DDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches an Away3D AWD file from a URL and parses it into a format-neutral Scene3DDocument (geometry, skins,
// and its skeleton animation). Fetches only the FILE — the document's texture refs stay unresolved; assemble
// with createScene3DFromDocument and acquire on your own schedule with loadScene3DResources or
// updateScene3DResourceStreaming. On a fetch failure returns null; it never creates a renderer or GPU
// resource.
export async function loadScene3DDocumentFromAwd2Url(
  host: HasNetHttp,
  url: string,
  options?: Readonly<Scene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const bytes = await loadScene3DDocumentBytesFromUrl(host, url, options);
  if (bytes === null) return null;
  const document = parseAwd2(bytes);
  setScene3DDocumentResourceBasePathFromUrl(document, url);
  return document;
}
