import { setNetBackend } from '@flighthq/net';
import { parseAwd } from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneDocumentFromAwdUrl } from './loadSceneFromAwd';

vi.mock('@flighthq/scene-formats', () => ({ parseAwd: vi.fn() }));

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

describe('loadSceneDocumentFromAwdUrl', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(parseAwd).mockReturnValue(document);
    setNetBackend({ sendNetRequest: async () => okResponse(new Uint8Array([5, 6]).buffer) });

    const loaded = await loadSceneDocumentFromAwdUrl('model.awd');

    expect(Array.from(vi.mocked(parseAwd).mock.calls[0][0])).toEqual([5, 6]);
    expect(loaded).toBe(document);
  });
});
