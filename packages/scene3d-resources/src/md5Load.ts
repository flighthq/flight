import { parseMd5Mesh } from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, Scene3DDocument, Scene3DDocumentLoadOptions } from '@flighthq/types/contract';

import { loadScene3DDocumentTextFromUrl, setScene3DDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches an MD5 mesh file (`.md5mesh`) from a URL and parses it into a format-neutral Scene3DDocument (mesh +
// skeleton). Fetches only the mesh FILE — a paired `.md5anim` is a separate file, and the document's shader
// texture refs stay unresolved; assemble with createScene3DFromDocument and resolve on your own schedule with
// loadScene3DResources. Returns null on transport failure; it never creates a renderer or GPU resource.
export async function loadScene3DDocumentFromMd5MeshUrl(
  host: HasNetHttp,
  url: string,
  options?: Readonly<Scene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const source = await loadScene3DDocumentTextFromUrl(host, url, options);
  if (source === null) return null;
  const document = parseMd5Mesh(source);
  setScene3DDocumentResourceBasePathFromUrl(document, url);
  return document;
}
