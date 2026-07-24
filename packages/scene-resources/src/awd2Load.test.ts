import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadAwd2Module from './awd2Load';

let loadSceneDocumentFromAwd2Url: typeof LoadAwd2Module.loadSceneDocumentFromAwd2Url;
let parseAwd2: Mock<typeof SceneFormatsModule.parseAwd2>;
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
  parseAwd2 = vi.fn<typeof SceneFormatsModule.parseAwd2>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parseAwd2 }));
  ({ loadSceneDocumentFromAwd2Url } = await import('./awd2Load'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parseAwd2.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFromAwd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseAwd2.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([5, 6]).buffer));

    const loaded = await loadSceneDocumentFromAwd2Url('model.awd');

    expect(Array.from(parseAwd2.mock.calls[0][0])).toEqual([5, 6]);
    expect(loaded).toBe(document);
  });
});
