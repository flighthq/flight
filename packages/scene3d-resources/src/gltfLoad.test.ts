import * as netContract from '@flighthq/net/contract';
import * as scene3dFormatsContract from '@flighthq/scene3d-formats/contract';
import type {
  GltfExtensionHandler,
  HasNetHttp,
  ImportDiagnostic,
  NetResponse,
  Scene3DDocument,
} from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromGlbUrl, loadScene3DDocumentFromGltfUrl } from './gltfLoad';

function emptyDocument(): Scene3DDocument {
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

function fakeHost(): HasNetHttp {
  const host: HasNetHttp = {
    net: { http: { sendNetRequest: (request, options) => netContract.sendNetRequest(host, request, options) } },
  };
  return host;
}

function response(body: string | ArrayBuffer, url = 'u'): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url };
}

beforeEach(() => {
  vi.spyOn(netContract, 'sendNetRequest').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsContract, 'parseGlb').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsContract, 'parseGltf').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene3DDocumentFromGlbUrl', () => {
  it('fetches bytes, carries the source base path, and returns a CPU document', async () => {
    const document = emptyDocument();
    const diagnostics: ImportDiagnostic[] = [];
    const extensionHandlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];
    vi.mocked(scene3dFormatsContract.parseGlb).mockReturnValue(document);
    vi.mocked(netContract.sendNetRequest).mockResolvedValue(response(new Uint8Array([1, 2, 3]).buffer));

    const loaded = await loadScene3DDocumentFromGlbUrl(fakeHost(), 'models/ship.glb', {
      diagnostics,
      extensionHandlers,
    });

    expect(Array.from(vi.mocked(scene3dFormatsContract.parseGlb).mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(vi.mocked(scene3dFormatsContract.parseGlb).mock.calls[0][1]).toBe(diagnostics);
    expect(vi.mocked(scene3dFormatsContract.parseGlb).mock.calls[0][2]).toEqual({
      basePath: 'models',
      extensionHandlers,
    });
    expect(vi.mocked(scene3dFormatsContract.parseGlb).mock.calls[0][2]?.extensionHandlers).toBe(extensionHandlers);
    expect(loaded).toBe(document);
  });

  it('returns null rather than an empty document on transport failure', async () => {
    vi.mocked(netContract.sendNetRequest).mockResolvedValue({
      body: null,
      headers: {},
      ok: false,
      status: 404,
      statusText: 'x',
      url: 'u',
    });

    await expect(loadScene3DDocumentFromGlbUrl(fakeHost(), 'missing.glb')).resolves.toBeNull();
    expect(scene3dFormatsContract.parseGlb).not.toHaveBeenCalled();
  });
});

describe('loadScene3DDocumentFromGltfUrl', () => {
  it('fetches external geometry buffers and supplies the image base path to parsing', async () => {
    const document = emptyDocument();
    const diagnostics: ImportDiagnostic[] = [];
    const extensionHandlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];
    vi.mocked(scene3dFormatsContract.parseGltf).mockReturnValue(document);
    const requested: string[] = [];
    vi.mocked(netContract.sendNetRequest).mockImplementation(async (_host, request) => {
      requested.push(request.url);
      return request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"mesh.bin"}]}')
        : response(new Uint8Array([8, 9]).buffer);
    });

    const loaded = await loadScene3DDocumentFromGltfUrl(fakeHost(), 'models/ship.gltf', {
      diagnostics,
      extensionHandlers,
    });

    expect(requested).toEqual(['models/ship.gltf', 'models/mesh.bin']);
    expect(vi.mocked(scene3dFormatsContract.parseGltf).mock.calls[0][1]).toBe(diagnostics);
    expect(vi.mocked(scene3dFormatsContract.parseGltf).mock.calls[0][2]).toEqual({
      basePath: 'models',
      extensionHandlers,
      externalBuffers: { 'mesh.bin': new Uint8Array([8, 9]) },
    });
    expect(vi.mocked(scene3dFormatsContract.parseGltf).mock.calls[0][2]?.extensionHandlers).toBe(extensionHandlers);
    expect(loaded).toBe(document);
  });

  it('returns null when JSON or a required external buffer cannot load', async () => {
    vi.mocked(netContract.sendNetRequest).mockResolvedValue(response('{'));
    await expect(loadScene3DDocumentFromGltfUrl(fakeHost(), 'broken.gltf')).resolves.toBeNull();

    vi.mocked(netContract.sendNetRequest).mockImplementation(async (_host, request) =>
      request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"missing.bin"}]}')
        : { body: null, headers: {}, ok: false, status: 404, statusText: 'x', url: request.url },
    );
    await expect(loadScene3DDocumentFromGltfUrl(fakeHost(), 'models/ship.gltf')).resolves.toBeNull();
    expect(scene3dFormatsContract.parseGltf).not.toHaveBeenCalled();
  });
});
