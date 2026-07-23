import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadGltfModule from './gltfLoad';

let loadSceneDocumentFromGlbUrl: typeof LoadGltfModule.loadSceneDocumentFromGlbUrl;
let loadSceneDocumentFromGltfUrl: typeof LoadGltfModule.loadSceneDocumentFromGltfUrl;
let parseGlb: Mock<typeof SceneFormatsModule.parseGlb>;
let parseGltf: Mock<typeof SceneFormatsModule.parseGltf>;
let sendNetRequest: Mock<typeof NetModule.sendNetRequest>;

function emptyDocument(): SceneDocument {
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

function response(body: string | ArrayBuffer, url = 'u'): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url };
}

beforeAll(async () => {
  vi.resetModules();
  parseGlb = vi.fn<typeof SceneFormatsModule.parseGlb>();
  parseGltf = vi.fn<typeof SceneFormatsModule.parseGltf>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parseGlb, parseGltf }));
  ({ loadSceneDocumentFromGlbUrl, loadSceneDocumentFromGltfUrl } = await import('./gltfLoad'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parseGlb.mockReset();
  parseGltf.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFromGlbUrl', () => {
  it('fetches bytes, carries the source base path, and returns a CPU document', async () => {
    const document = emptyDocument();
    parseGlb.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(response(new Uint8Array([1, 2, 3]).buffer));

    const loaded = await loadSceneDocumentFromGlbUrl('models/ship.glb');

    expect(Array.from(parseGlb.mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(parseGlb.mock.calls[0][2]).toEqual({ basePath: 'models' });
    expect(loaded).toBe(document);
  });

  it('returns null rather than an empty document on transport failure', async () => {
    sendNetRequest.mockResolvedValue({
      body: null,
      headers: {},
      ok: false,
      status: 404,
      statusText: 'x',
      url: 'u',
    });

    await expect(loadSceneDocumentFromGlbUrl('missing.glb')).resolves.toBeNull();
    expect(parseGlb).not.toHaveBeenCalled();
  });
});

describe('loadSceneDocumentFromGltfUrl', () => {
  it('fetches external geometry buffers and supplies the image base path to parsing', async () => {
    const document = emptyDocument();
    parseGltf.mockReturnValue(document);
    const requested: string[] = [];
    sendNetRequest.mockImplementation(async (request) => {
      requested.push(request.url);
      return request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"mesh.bin"}]}')
        : response(new Uint8Array([8, 9]).buffer);
    });

    const loaded = await loadSceneDocumentFromGltfUrl('models/ship.gltf');

    expect(requested).toEqual(['models/ship.gltf', 'models/mesh.bin']);
    expect(parseGltf.mock.calls[0][2]).toEqual({
      basePath: 'models',
      externalBuffers: { 'mesh.bin': new Uint8Array([8, 9]) },
    });
    expect(loaded).toBe(document);
  });

  it('returns null when JSON or a required external buffer cannot load', async () => {
    sendNetRequest.mockResolvedValue(response('{'));
    await expect(loadSceneDocumentFromGltfUrl('broken.gltf')).resolves.toBeNull();

    sendNetRequest.mockImplementation(async (request) =>
      request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"missing.bin"}]}')
        : { body: null, headers: {}, ok: false, status: 404, statusText: 'x', url: request.url },
    );
    await expect(loadSceneDocumentFromGltfUrl('models/ship.gltf')).resolves.toBeNull();
    expect(parseGltf).not.toHaveBeenCalled();
  });
});
