import { parseObj } from '@flighthq/scene-formats';
import type { ObjMaterialLibrary, SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';

import { loadSceneDocumentTextFromUrl, setSceneDocumentResourceBasePathFromUrl } from './sceneDocumentSource';

// Fetches a Wavefront OBJ file from a URL and parses it into a format-neutral SceneDocument, using an
// optional already-parsed MTL library for its materials. Fetches only the OBJ FILE (the `.mtl` sidecar and
// its image URIs are the caller's to fetch/parse) — the document's texture refs stay unresolved; assemble
// with createSceneFromDocument and resolve on your own schedule. Returns null on transport failure; it
// never creates a renderer or GPU resource.
export async function loadSceneDocumentFromObjUrl(
  url: string,
  materials?: Readonly<ObjMaterialLibrary>,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const source = await loadSceneDocumentTextFromUrl(url, options);
  if (source === null) return null;
  const document = parseObj(source, materials);
  setSceneDocumentResourceBasePathFromUrl(document, url);
  return document;
}
