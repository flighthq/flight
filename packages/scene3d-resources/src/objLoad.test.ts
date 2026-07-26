import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type { NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadObjModule from './objLoad';

let loadScene3DDocumentFromObjUrl: typeof LoadObjModule.loadScene3DDocumentFromObjUrl;
let parseObj: Mock<typeof Scene3DFormatsModule.parseObj>;
let sendNetRequest: Mock<typeof NetModule.sendNetRequest>;

function emptyDocument(): Scene3DDocument {
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
  parseObj = vi.fn<typeof Scene3DFormatsModule.parseObj>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene3d-formats', () => ({ parseObj }));
  ({ loadScene3DDocumentFromObjUrl } = await import('./objLoad'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene3d-formats');
  vi.resetModules();
});

afterEach(() => {
  parseObj.mockReset();
  sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFromObjUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseObj.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse('v 0 0 0'));

    const loaded = await loadScene3DDocumentFromObjUrl('model.obj');

    expect(parseObj).toHaveBeenCalledWith('v 0 0 0', undefined);
    expect(loaded).toBe(document);
  });
});
