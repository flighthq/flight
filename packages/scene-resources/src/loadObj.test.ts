import { setNetBackend } from '@flighthq/net';
import { parseObj } from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneDocumentFromObjUrl } from './loadObj';

vi.mock('@flighthq/scene-formats', () => ({ parseObj: vi.fn() }));

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

describe('loadSceneDocumentFromObjUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(parseObj).mockReturnValue(document);
    setNetBackend({ sendNetRequest: async () => okResponse('v 0 0 0') });

    const loaded = await loadSceneDocumentFromObjUrl('model.obj');

    expect(vi.mocked(parseObj)).toHaveBeenCalledWith('v 0 0 0', undefined);
    expect(loaded).toBe(document);
  });
});
