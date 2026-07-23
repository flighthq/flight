import { setNetBackend } from '@flighthq/net';
import { parseMd5Mesh } from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneDocumentFromMd5MeshUrl } from './loadMd5';

vi.mock('@flighthq/scene-formats', () => ({ parseMd5Mesh: vi.fn() }));

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

function okResponse(body: string): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadSceneDocumentFromMd5MeshUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(parseMd5Mesh).mockReturnValue(document);
    setNetBackend({ sendNetRequest: async () => okResponse('MD5Version 10') });

    const loaded = await loadSceneDocumentFromMd5MeshUrl('model.md5mesh');

    expect(vi.mocked(parseMd5Mesh)).toHaveBeenCalledWith('MD5Version 10');
    expect(loaded).toBe(document);
  });
});
