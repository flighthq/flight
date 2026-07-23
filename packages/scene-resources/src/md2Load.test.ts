import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadMd2Module from './md2Load';

let loadSceneDocumentFromMd2Url: typeof LoadMd2Module.loadSceneDocumentFromMd2Url;
let parseMd2: Mock<typeof SceneFormatsModule.parseMd2>;
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

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

beforeAll(async () => {
  vi.resetModules();
  parseMd2 = vi.fn<typeof SceneFormatsModule.parseMd2>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parseMd2 }));
  ({ loadSceneDocumentFromMd2Url } = await import('./md2Load'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parseMd2.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFromMd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseMd2.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([7]).buffer));

    const loaded = await loadSceneDocumentFromMd2Url('model.md2');

    expect(Array.from(parseMd2.mock.calls[0][0])).toEqual([7]);
    expect(loaded).toBe(document);
  });
});
