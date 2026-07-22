import type { Scene } from '@flighthq/scene';
import { createSceneFromAwd, parseAwd } from '@flighthq/scene-formats';
import type { SceneDocument } from '@flighthq/types';
import type { LoadSceneOptions } from '@flighthq/types';

import { allocateEmptySceneDocument, loadSceneDocumentBytes } from './loadSceneDocumentSource';
import { resolveScenesWithOptions } from './loadSceneOptions';

// Fetches an Away3D AWD file from a URL and parses it into a format-neutral SceneDocument (geometry, skins,
// and its skeleton animation). Fetches only the FILE — the document's texture refs stay unresolved; assemble
// with createSceneFromDocument and resolve on your own schedule with resolveSceneResources. On a fetch
// failure a warning is pushed and an empty document is returned.
export async function loadAwd(url: string, warnings?: string[]): Promise<SceneDocument> {
  const bytes = await loadSceneDocumentBytes(url, 'loadAwd', warnings);
  return bytes === null ? allocateEmptySceneDocument() : parseAwd(bytes, warnings);
}

// Parse-and-resolve convenience over @flighthq/scene-formats: parses AWD bytes into a Scene (geometry
// plus its folded skeleton animation), then resolves all pending texture resources eagerly, returning
// the fully-resolved scene. When no resolver is supplied a private one is created and disposed after the
// load; a supplied resolver is left open for the caller to keep driving or dispose.
export async function loadSceneFromAwd(bytes: Uint8Array, options?: Readonly<LoadSceneOptions>): Promise<Scene> {
  const scene = createSceneFromAwd(bytes);
  await resolveScenesWithOptions([scene], options);
  return scene;
}
