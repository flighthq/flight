import { parseGlbWithCoreFeatureHandlers, parseGltfWithCoreFeatureHandlers } from '@flighthq/scene3d-formats/contract';
import type {
  GltfCoreFeatureHandler,
  GltfDocument,
  GltfScene3DDocumentLoadOptions,
  HostNetCapability,
  Scene3DDocument,
  Scene3DDocumentLoadOptions,
} from '@flighthq/types/contract';

import {
  getScene3DDocumentBasePathFromUrl,
  loadScene3DDocumentBytesFromUrl,
  loadScene3DDocumentTextFromUrl,
} from './sceneDocumentSource.ts';

export async function loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(
  hostNet: Readonly<HostNetCapability>,
  url: string,
  coreFeatureHandlers: readonly GltfCoreFeatureHandler[],
  options?: Readonly<GltfScene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const bytes = await loadScene3DDocumentBytesFromUrl(hostNet, url, options);
  if (bytes === null) return null;
  return parseGlbWithCoreFeatureHandlers(bytes, coreFeatureHandlers, options?.diagnostics, {
    basePath: getScene3DDocumentBasePathFromUrl(url),
    extensionHandlers: options?.extensionHandlers,
  });
}

export async function loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers(
  hostNet: Readonly<HostNetCapability>,
  url: string,
  coreFeatureHandlers: readonly GltfCoreFeatureHandler[],
  options?: Readonly<GltfScene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  const source = await loadScene3DDocumentTextFromUrl(hostNet, url, options);
  if (source === null) return null;

  let gltf: GltfDocument;
  try {
    gltf = JSON.parse(source) as GltfDocument;
  } catch {
    return null;
  }
  if (gltf === null || typeof gltf !== 'object') return null;

  const basePath = getScene3DDocumentBasePathFromUrl(url);
  const externalBuffers = await loadGltfExternalBuffers(hostNet, gltf, basePath, options);
  if (externalBuffers === null) return null;
  return parseGltfWithCoreFeatureHandlers(gltf, coreFeatureHandlers, options?.diagnostics, {
    basePath,
    extensionHandlers: options?.extensionHandlers,
    externalBuffers,
  });
}

async function loadGltfExternalBuffers(
  hostNet: Readonly<HostNetCapability>,
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
    entries.map((uri) => loadScene3DDocumentBytesFromUrl(hostNet, resolveGltfBufferUrl(uri, basePath), options)),
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
