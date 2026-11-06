import type { HostNetCapability } from '@flighthq/net/contract';
import { parseObj } from '@flighthq/scene3d-formats/contract';
import type { Scene3DDocument } from '@flighthq/scene3d/contract';
import type { ObjMaterialLibrary } from '@flighthq/types/contract';

import { loadScene3DDocumentTextFromUrl, setScene3DDocumentResourceBasePathFromUrl } from './sceneDocumentSource.ts';
import type { Scene3DDocumentLoadOptions } from './types.ts';

// Fetches a Wavefront OBJ file from a URL and parses it into a format-neutral Scene3DDocument, using an
// optional already-parsed MTL library for its materials. Fetches only the OBJ FILE (the `.mtl` sidecar and
// its image URIs are the caller's to fetch/parse) — the document's texture refs stay unresolved; assemble
// with createScene3DFromDocument and resolve on your own schedule. Returns null on transport failure; it
// never creates a renderer or GPU resource.
export async function loadScene3DDocumentFromObjUrl(
  hostNet: Readonly<HostNetCapability>,
  url: string,
  materials?: Readonly<ObjMaterialLibrary>,
  options?: Readonly<Scene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const source = await loadScene3DDocumentTextFromUrl(hostNet, url, options);
  if (source === null) return null;
  const document = parseObj(source, materials);
  setScene3DDocumentResourceBasePathFromUrl(document, url);
  return document;
}
