import { setNetBackend } from '@flighthq/net';
import { parseGlb, parseGltf } from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneDocumentFromGlbUrl, loadSceneDocumentFromGltfUrl } from './loadGltf';

vi.mock('@flighthq/scene-formats', () => ({ parseGlb: vi.fn(), parseGltf: vi.fn() }));

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

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadSceneDocumentFromGlbUrl', () => {
  it('fetches bytes, carries the source base path, and returns a CPU document', async () => {
    const document = emptyDocument();
    vi.mocked(parseGlb).mockReturnValue(document);
    setNetBackend({ sendNetRequest: async () => response(new Uint8Array([1, 2, 3]).buffer) });

    const loaded = await loadSceneDocumentFromGlbUrl('models/ship.glb');

    expect(Array.from(vi.mocked(parseGlb).mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(vi.mocked(parseGlb).mock.calls[0][2]).toEqual({ basePath: 'models' });
    expect(loaded).toBe(document);
  });

  it('returns null rather than an empty document on transport failure', async () => {
    setNetBackend({
      sendNetRequest: async () => ({ body: null, headers: {}, ok: false, status: 404, statusText: 'x', url: 'u' }),
    });

    await expect(loadSceneDocumentFromGlbUrl('missing.glb')).resolves.toBeNull();
    expect(vi.mocked(parseGlb)).not.toHaveBeenCalled();
  });
});

describe('loadSceneDocumentFromGltfUrl', () => {
  it('fetches external geometry buffers and supplies the image base path to parsing', async () => {
    const document = emptyDocument();
    vi.mocked(parseGltf).mockReturnValue(document);
    const requested: string[] = [];
    setNetBackend({
      sendNetRequest: async (request) => {
        requested.push(request.url);
        return request.url.endsWith('.gltf')
          ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"mesh.bin"}]}')
          : response(new Uint8Array([8, 9]).buffer);
      },
    });

    const loaded = await loadSceneDocumentFromGltfUrl('models/ship.gltf');

    expect(requested).toEqual(['models/ship.gltf', 'models/mesh.bin']);
    expect(vi.mocked(parseGltf).mock.calls[0][2]).toEqual({
      basePath: 'models',
      externalBuffers: { 'mesh.bin': new Uint8Array([8, 9]) },
    });
    expect(loaded).toBe(document);
  });

  it('returns null when JSON or a required external buffer cannot load', async () => {
    setNetBackend({ sendNetRequest: async () => response('{') });
    await expect(loadSceneDocumentFromGltfUrl('broken.gltf')).resolves.toBeNull();

    setNetBackend({
      sendNetRequest: async (request) =>
        request.url.endsWith('.gltf')
          ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"missing.bin"}]}')
          : { body: null, headers: {}, ok: false, status: 404, statusText: 'x', url: request.url },
    });
    await expect(loadSceneDocumentFromGltfUrl('models/ship.gltf')).resolves.toBeNull();
    expect(vi.mocked(parseGltf)).not.toHaveBeenCalled();
  });
});
