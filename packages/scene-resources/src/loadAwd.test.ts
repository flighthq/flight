import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadAwdModule from './loadAwd';

let loadSceneDocumentFromAwdUrl: typeof LoadAwdModule.loadSceneDocumentFromAwdUrl;
let parseAwd: Mock<typeof SceneFormatsModule.parseAwd>;
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
  parseAwd = vi.fn<typeof SceneFormatsModule.parseAwd>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parseAwd }));
  ({ loadSceneDocumentFromAwdUrl } = await import('./loadAwd'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parseAwd.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFromAwdUrl', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseAwd.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([5, 6]).buffer));

    const loaded = await loadSceneDocumentFromAwdUrl('model.awd');

    expect(Array.from(parseAwd.mock.calls[0][0])).toEqual([5, 6]);
    expect(loaded).toBe(document);
  });
});
