import { setNetBackend } from '@flighthq/net';
import { parse3ds } from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneDocumentFrom3dsUrl } from './load3ds';

vi.mock('@flighthq/scene-formats', () => ({ parse3ds: vi.fn() }));

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

describe('loadSceneDocumentFrom3dsUrl', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(parse3ds).mockReturnValue(document);
    setNetBackend({ sendNetRequest: async () => okResponse(new Uint8Array([9, 8]).buffer) });

    const loaded = await loadSceneDocumentFrom3dsUrl('model.3ds');

    expect(Array.from(vi.mocked(parse3ds).mock.calls[0][0])).toEqual([9, 8]);
    expect(loaded).toBe(document);
  });
});
