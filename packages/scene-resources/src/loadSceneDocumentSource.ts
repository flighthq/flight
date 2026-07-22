import { sendNetRequest } from '@flighthq/net';
import type { SceneDocument } from '@flighthq/types';

// The empty SceneDocument a URL loader returns when the fetch fails — every table present and empty, so the
// caller and the assembler never special-case a partial document (matching each parser's own empty shape).
export function allocateEmptySceneDocument(): SceneDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

// Fetches a scene file's raw bytes from a URL through the active @flighthq/net backend (responseType
// 'arraybuffer'), for the binary document loaders (glTF `.glb`, AWD, MD2, 3DS). Returns the bytes on a 2xx
// response, or null on any expected transport/HTTP failure (a warning is pushed) — the caller then returns
// an empty document rather than throwing. No texture resolution happens here: this fetches only the scene
// FILE; a document's texture refs stay unresolved until the explicit resolveSceneResources pass.
export async function loadSceneDocumentBytes(
  url: string,
  loaderName: string,
  warnings?: string[],
): Promise<Uint8Array | null> {
  const response = await sendNetRequest({ method: 'GET', responseType: 'arraybuffer', url });
  if (!response.ok || !(response.body instanceof ArrayBuffer)) {
    warnings?.push(`${loaderName}: failed to fetch '${url}' (status ${response.status} ${response.statusText})`);
    return null;
  }
  return new Uint8Array(response.body);
}

// Fetches a scene file's text from a URL through the active @flighthq/net backend (responseType 'text'),
// for the text document loaders (OBJ, MD5). Returns the text on a 2xx response, or null on any expected
// transport/HTTP failure (a warning is pushed). Fetches only the scene FILE — no texture resolution.
export async function loadSceneDocumentText(
  url: string,
  loaderName: string,
  warnings?: string[],
): Promise<string | null> {
  const response = await sendNetRequest({ method: 'GET', responseType: 'text', url });
  if (!response.ok || typeof response.body !== 'string') {
    warnings?.push(`${loaderName}: failed to fetch '${url}' (status ${response.status} ${response.statusText})`);
    return null;
  }
  return response.body;
}
