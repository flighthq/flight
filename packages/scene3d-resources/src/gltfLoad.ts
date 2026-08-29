import { parseGlb, parseGltf } from '@flighthq/scene3d-formats/contract';
import type {
  GltfDocument,
  GltfScene3DDocumentLoadOptions,
  Scene3DDocument,
  Scene3DDocumentLoadOptions,
} from '@flighthq/types/contract';

import {
  getScene3DDocumentBasePathFromUrl,
  loadScene3DDocumentBytesFromUrl,
  loadScene3DDocumentTextFromUrl,
} from './sceneDocumentSource';

// Fetches a binary glTF (`.glb`) from a URL and parses it into a format-neutral Scene3DDocument. Fetches only
// the FILE — the document's texture refs stay unresolved; assemble with createScene3DFromDocument and load
// resources on your own schedule. Returns null on transport failure and never touches rendering/GPU state.
export async function loadScene3DDocumentFromGlbUrl(
  url: string,
  options?: Readonly<GltfScene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const bytes = await loadScene3DDocumentBytesFromUrl(url, options);
  if (bytes === null) return null;
  return parseGlb(bytes, options?.diagnostics, {
    basePath: getScene3DDocumentBasePathFromUrl(url),
    extensionHandlers: options?.extensionHandlers,
  });
}

// Fetches a glTF file from a URL and parses it into a format-neutral Scene3DDocument. The JSON `.gltf` form is
// fetched as text; every external `.bin` required to build inline geometry is fetched too, while image URIs
// remain unresolved resource refs carrying the model's base path. Assemble with createScene3DFromDocument and
// load images explicitly. Returns null if the main source or required geometry closure cannot be acquired.
export async function loadScene3DDocumentFromGltfUrl(
  url: string,
  options?: Readonly<GltfScene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const source = await loadScene3DDocumentTextFromUrl(url, options);
  if (source === null) return null;

  let gltf: GltfDocument;
  try {
    gltf = JSON.parse(source) as GltfDocument;
  } catch {
    return null;
  }
  if (gltf === null || typeof gltf !== 'object') return null;

  const basePath = getScene3DDocumentBasePathFromUrl(url);
  const externalBuffers = await loadGltfExternalBuffers(gltf, basePath, options);
  if (externalBuffers === null) return null;
  return parseGltf(gltf, options?.diagnostics, {
    basePath,
    extensionHandlers: options?.extensionHandlers,
    externalBuffers,
  });
}

async function loadGltfExternalBuffers(
  gltf: Readonly<GltfDocument>,
  basePath: string | null,
  options?: Readonly<Scene3DDocumentLoadOptions>,
): Promise<Record<string, Uint8Array> | null> {
  const uris = new Set<string>();
  for (const buffer of gltf.buffers ?? []) {
    const uri = buffer.uri;
    if (uri !== undefined && !uri.startsWith('data:')) uris.add(uri);
  }

  const externalBuffers: Record<string, Uint8Array> = {};
  const entries = [...uris];
  const bytes = await Promise.all(
    entries.map((uri) => loadScene3DDocumentBytesFromUrl(resolveGltfBufferUrl(uri, basePath), options)),
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
