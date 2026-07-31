import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type { NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as LoadMd2Module from './md2Load';

let loadScene3DDocumentFromMd2Url: typeof LoadMd2Module.loadScene3DDocumentFromMd2Url;
let parseMd2: Mock<typeof Scene3DFormatsModule.parseMd2>;
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

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

beforeAll(async () => {
  vi.resetModules();
  parseMd2 = vi.fn<typeof Scene3DFormatsModule.parseMd2>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net/contract', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene3d-formats/contract', () => ({ parseMd2 }));
  ({ loadScene3DDocumentFromMd2Url } = await import('./md2Load'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net/contract');
  vi.doUnmock('@flighthq/scene3d-formats/contract');
  vi.resetModules();
});

afterEach(() => {
  parseMd2.mockReset();
  sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFromMd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parseMd2.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([7]).buffer));

    const loaded = await loadScene3DDocumentFromMd2Url('model.md2');

    expect(Array.from(parseMd2.mock.calls[0][0])).toEqual([7]);
    expect(loaded).toBe(document);
  });
});
