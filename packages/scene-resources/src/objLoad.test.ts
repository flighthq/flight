import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadObjModule from './objLoad';

let loadSceneDocumentFromObjUrl: typeof LoadObjModule.loadSceneDocumentFromObjUrl;
let parseObj: Mock<typeof SceneFormatsModule.parseObj>;
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
  parseObj = vi.fn<typeof SceneFormatsModule.parseObj>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parseObj }));
  ({ loadSceneDocumentFromObjUrl } = await import('./objLoad'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parseObj.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFromObjUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseObj.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse('v 0 0 0'));

    const loaded = await loadSceneDocumentFromObjUrl('model.obj');

    expect(parseObj).toHaveBeenCalledWith('v 0 0 0', undefined);
    expect(loaded).toBe(document);
  });
});
