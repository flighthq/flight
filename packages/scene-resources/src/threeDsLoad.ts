import { parse3ds } from '@flighthq/scene-formats';
import type { Scene3DDocument, Scene3DDocumentLoadOptions } from '@flighthq/types';

import { loadScene3DDocumentBytesFromUrl, setScene3DDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches an Autodesk 3DS binary from a URL and parses it into a format-neutral Scene3DDocument. Fetches only
// the FILE — the document's texture refs stay unresolved; assemble with createScene3DFromDocument and resolve
// on your own schedule. Returns null on transport failure; it never creates a renderer or GPU resource.
export async function loadScene3DDocumentFrom3dsUrl(
  url: string,
  options?: Readonly<Scene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const bytes = await loadScene3DDocumentBytesFromUrl(url, options);
  if (bytes === null) return null;
  const document = parse3ds(bytes);
  setScene3DDocumentResourceBasePathFromUrl(document, url);
  return document;
}
