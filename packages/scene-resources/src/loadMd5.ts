import type { Scene } from '@flighthq/scene';
import { createSceneFromMd5Mesh, parseMd5Mesh } from '@flighthq/scene-formats';
import type { SceneDocument } from '@flighthq/types';

import { createEmptySceneDocument, loadSceneDocumentText } from './loadSceneDocumentSource';
import type { LoadSceneOptions } from './loadSceneOptions';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Fetches an MD5 mesh file (`.md5mesh`) from a URL and parses it into a format-neutral SceneDocument (mesh +
// skeleton). Fetches only the mesh FILE — a paired `.md5anim` is a separate file, and the document's shader
// texture refs stay unresolved; assemble with createSceneFromDocument and resolve on your own schedule with
// resolveSceneResources. On a fetch failure a warning is pushed and an empty document is returned.
export async function loadMd5Mesh(url: string, warnings?: string[]): Promise<SceneDocument> {
  const source = await loadSceneDocumentText(url, 'loadMd5Mesh', warnings);
  return source === null ? createEmptySceneDocument() : parseMd5Mesh(source, warnings);
}

// Parses an MD5 mesh (`.md5mesh`) into a Scene (mesh + skeleton) and resolves its shader textures. The async
// sibling of createSceneFromMd5Mesh. A paired `.md5anim` is a separate file: parse it with parseMd5Anim
// against `findSceneSkeletonJoints(scene.root)` and assign the clip into `scene.animations` under an action
// name.
export async function loadSceneFromMd5Mesh(meshSource: string, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromMd5Mesh(meshSource);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
