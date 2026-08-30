import { parseMd2 } from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, Scene3DDocument, Scene3DDocumentLoadOptions } from '@flighthq/types/contract';

import { loadScene3DDocumentBytesFromUrl, setScene3DDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches an id Software MD2 (Quake 2) model from a URL and parses it into a format-neutral Scene3DDocument
// (a morph-animated mesh). Fetches only the FILE — the document's skin texture ref stays unresolved;
// assemble with createScene3DFromDocument and resolve on your own schedule. Returns null on transport failure;
// it never creates a renderer or GPU resource.
export async function loadScene3DDocumentFromMd2Url(
  host: HasNetHttp,
  url: string,
  options?: Readonly<Scene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const bytes = await loadScene3DDocumentBytesFromUrl(host, url, options);
  if (bytes === null) return null;
  const document = parseMd2(bytes);
  setScene3DDocumentResourceBasePathFromUrl(document, url);
  return document;
}
