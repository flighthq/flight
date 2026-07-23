import { sendNetRequest } from '@flighthq/net';
import { connectSignal, createSignal, emitSignal } from '@flighthq/signals';
import type { NetProgress, NetRequestOptions, SceneDocument, SceneDocumentLoadOptions } from '@flighthq/types';
import { ImageResourceReferenceKind } from '@flighthq/types';

export function getSceneDocumentBasePathFromUrl(url: string): string | null {
  const query = url.search(/[?#]/);
  const source = query >= 0 ? url.slice(0, query) : url;
  const slash = source.lastIndexOf('/');
  return slash < 0 ? null : source.slice(0, slash);
}

// Fetches a scene file's raw bytes from a URL through the active @flighthq/net backend (responseType
// 'arraybuffer'), for the binary document loaders (glTF `.glb`, AWD, MD2, 3DS). Returns the bytes on a 2xx
// response, or null on any expected transport/HTTP failure. No resource resolution or renderer/GPU work
// happens here; callers compose parsing and later resource acquisition explicitly.
export async function loadSceneDocumentBytesFromUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<Uint8Array | null> {
  const response = await sendNetRequest(
    { method: 'GET', responseType: 'arraybuffer', url },
    createSceneDocumentNetRequestOptions(url, options),
  );
  if (!response.ok || !(response.body instanceof ArrayBuffer)) return null;
  return new Uint8Array(response.body);
}

// Fetches a scene file's text from a URL through the active @flighthq/net backend (responseType 'text'),
// for the text document loaders (OBJ, MD5). Returns the text on a 2xx response, or null on any expected
// transport/HTTP failure. Fetches only source text — no parsing, resource realization, or rendering work.
export async function loadSceneDocumentTextFromUrl(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): Promise<string | null> {
  const response = await sendNetRequest(
    { method: 'GET', responseType: 'text', url },
    createSceneDocumentNetRequestOptions(url, options),
  );
  if (!response.ok || typeof response.body !== 'string') return null;
  return response.body;
}

// Carries the loaded model's directory onto relative external image references emitted by formats whose
// parser consumed only in-hand bytes/text. Existing non-null base paths are authoritative and untouched.
export function setSceneDocumentResourceBasePathFromUrl(document: SceneDocument, url: string): void {
  const basePath = getSceneDocumentBasePathFromUrl(url);
  if (basePath === null) return;
  for (const resource of document.resources) {
    if (resource.kind === ImageResourceReferenceKind.External && resource.basePath === null) {
      resource.basePath = basePath;
    }
  }
}

function createSceneDocumentNetRequestOptions(
  url: string,
  options?: Readonly<SceneDocumentLoadOptions>,
): NetRequestOptions | undefined {
  if (options === undefined) return undefined;
  const out: NetRequestOptions = { signal: options.signal };
  const outputProgress = options.progress;
  if (outputProgress !== undefined) {
    const progress = createSignal<(progress: Readonly<NetProgress>) => void>();
    connectSignal(progress, (event) => {
      emitSignal(outputProgress, { loaded: event.loaded, phase: event.phase, total: event.total, url });
    });
    out.progress = progress;
  }
  return out;
}
