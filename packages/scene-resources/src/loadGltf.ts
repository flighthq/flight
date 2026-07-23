import { parseGlb, parseGltf } from '@flighthq/scene-formats';
import type { GltfDocument, SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';

import {
  getSceneDocumentBasePathFromUrl,
  loadSceneDocumentBytesFromUrl,
  loadSceneDocumentTextFromUrl,
} from './loadSceneDocumentSource';

// Fetches a binary glTF (`.glb`) from a URL and parses it into a format-neutral SceneDocument. Fetches only
// the FILE — the document's texture refs stay unresolved; assemble with createSceneFromDocument and load
// resources on your own schedule. Returns null on transport failure and never touches rendering/GPU state.
export async function loadSceneDocumentFromGlbUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const bytes = await loadSceneDocumentBytesFromUrl(url, options);
  if (bytes === null) return null;
  return parseGlb(bytes, undefined, { basePath: getSceneDocumentBasePathFromUrl(url) });
}

// Fetches a glTF file from a URL and parses it into a format-neutral SceneDocument. The JSON `.gltf` form is
// fetched as text; every external `.bin` required to build inline geometry is fetched too, while image URIs
// remain unresolved resource refs carrying the model's base path. Assemble with createSceneFromDocument and
// load images explicitly. Returns null if the main source or required geometry closure cannot be acquired.
export async function loadSceneDocumentFromGltfUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<SceneDocument | null> {
  const source = await loadSceneDocumentTextFromUrl(url, options);
  if (source === null) return null;

  let gltf: GltfDocument;
  try {
    gltf = JSON.parse(source) as GltfDocument;
  } catch {
    return null;
  }
  if (gltf === null || typeof gltf !== 'object') return null;

  const basePath = getSceneDocumentBasePathFromUrl(url);
  const externalBuffers = await loadGltfExternalBuffers(gltf, basePath, options);
  if (externalBuffers === null) return null;
  return parseGltf(gltf, undefined, { basePath, externalBuffers });
}

async function loadGltfExternalBuffers(
  gltf: Readonly<GltfDocument>,
  basePath: string | null,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<Record<string, Uint8Array> | null> {
  const uris = new Set<string>();
  for (const buffer of gltf.buffers ?? []) {
    const uri = buffer.uri;
    if (uri !== undefined && !uri.startsWith('data:')) uris.add(uri);
  }

  const externalBuffers: Record<string, Uint8Array> = {};
  const entries = [...uris];
  const bytes = await Promise.all(
    entries.map((uri) => loadSceneDocumentBytesFromUrl(resolveGltfBufferUrl(uri, basePath), options)),
  );
  for (let i = 0; i < entries.length; i++) {
    const value = bytes[i];
    if (value === null) return null;
    externalBuffers[entries[i]] = value;
  }
  return externalBuffers;
}

function resolveGltfBufferUrl(uri: string, basePath: string | null): string {
  if (basePath === null || uri.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri)) return uri;
  return basePath.endsWith('/') ? `${basePath}${uri}` : `${basePath}/${uri}`;
}
