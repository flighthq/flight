import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type { NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as Load3dsModule from './threeDsLoad';

let loadScene3DDocumentFrom3dsUrl: typeof Load3dsModule.loadScene3DDocumentFrom3dsUrl;
let parse3ds: Mock<typeof Scene3DFormatsModule.parse3ds>;
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
  parse3ds = vi.fn<typeof Scene3DFormatsModule.parse3ds>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net/contract', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene3d-formats/contract', () => ({ parse3ds }));
  ({ loadScene3DDocumentFrom3dsUrl } = await import('./threeDsLoad'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene3d-formats');
  vi.resetModules();
});

afterEach(() => {
  parse3ds.mockReset();
  sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFrom3dsUrl', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parse3ds.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([9, 8]).buffer));

    const loaded = await loadScene3DDocumentFrom3dsUrl('model.3ds');

    expect(Array.from(parse3ds.mock.calls[0][0])).toEqual([9, 8]);
    expect(loaded).toBe(document);
  });
});
