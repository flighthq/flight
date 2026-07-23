import { setNetBackend } from '@flighthq/net';
import { parseMd2 } from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneDocumentFromMd2Url } from './loadMd2';

vi.mock('@flighthq/scene-formats', () => ({ parseMd2: vi.fn() }));

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

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadSceneDocumentFromMd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(parseMd2).mockReturnValue(document);
    setNetBackend({ sendNetRequest: async () => okResponse(new Uint8Array([7]).buffer) });

    const loaded = await loadSceneDocumentFromMd2Url('model.md2');

    expect(Array.from(vi.mocked(parseMd2).mock.calls[0][0])).toEqual([7]);
    expect(loaded).toBe(document);
  });
});
