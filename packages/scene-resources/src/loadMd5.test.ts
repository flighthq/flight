import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadMd5Module from './loadMd5';

let loadSceneDocumentFromMd5MeshUrl: typeof LoadMd5Module.loadSceneDocumentFromMd5MeshUrl;
let parseMd5Mesh: Mock<typeof SceneFormatsModule.parseMd5Mesh>;
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

function okResponse(body: string): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

beforeAll(async () => {
  vi.resetModules();
  parseMd5Mesh = vi.fn<typeof SceneFormatsModule.parseMd5Mesh>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parseMd5Mesh }));
  ({ loadSceneDocumentFromMd5MeshUrl } = await import('./loadMd5'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parseMd5Mesh.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFromMd5MeshUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseMd5Mesh.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse('MD5Version 10'));

    const loaded = await loadSceneDocumentFromMd5MeshUrl('model.md5mesh');

    expect(parseMd5Mesh).toHaveBeenCalledWith('MD5Version 10');
    expect(loaded).toBe(document);
  });
});
