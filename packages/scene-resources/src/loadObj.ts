import type { Scene } from '@flighthq/scene';
import { createSceneFromObj, parseObj } from '@flighthq/scene-formats';
import type { ObjMaterialLibrary } from '@flighthq/scene-formats';
import type { SceneDocument } from '@flighthq/types';

import { createEmptySceneDocument, loadSceneDocumentText } from './loadSceneDocumentSource';
import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Fetches a Wavefront OBJ file from a URL and parses it into a format-neutral SceneDocument, using an
// optional already-parsed MTL library for its materials. Fetches only the OBJ FILE (the `.mtl` sidecar and
// its image URIs are the caller's to fetch/parse) — the document's texture refs stay unresolved; assemble
// with createSceneFromDocument and resolve on your own schedule with resolveSceneResources. On a fetch
// failure a warning is pushed and an empty document is returned.
export async function loadObj(
  url: string,
  materials?: Readonly<ObjMaterialLibrary>,
  warnings?: string[],
): Promise<SceneDocument> {
  const source = await loadSceneDocumentText(url, 'loadObj', warnings);
  return source === null ? createEmptySceneDocument() : parseObj(source, materials, warnings);
}

// Parses a Wavefront OBJ (with an optional parsed MTL library) into a Scene and resolves the material
// textures the library referenced. The async sibling of createSceneFromObj.
export async function loadSceneFromObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  options?: Readonly<LoadSceneOptions>,
): Promise<Scene> {
  const scene = createSceneFromObj(source, materials);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
