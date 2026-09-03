import * as netModule from '@flighthq/net/contract';
import * as scene3dFormatsModule from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFrom3dsUrl } from './threeDsLoad';

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

function fakeHost(): HasNetHttp {
  const host: HasNetHttp = {
    net: {
      http: {
        [EntityRuntimeKey]: undefined,
        sendNetRequest: (request, options) => netModule.sendNetRequest(host, request, options),
      },
    },
  };
  return host;
}

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

beforeEach(() => {
  vi.spyOn(netModule, 'sendNetRequest').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsModule, 'parse3ds').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene3DDocumentFrom3dsUrl', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(scene3dFormatsModule.parse3ds).mockReturnValue(document);
    vi.mocked(netModule.sendNetRequest).mockResolvedValue(okResponse(new Uint8Array([9, 8]).buffer));

    const loaded = await loadScene3DDocumentFrom3dsUrl(fakeHost(), 'model.3ds');

    expect(Array.from(vi.mocked(scene3dFormatsModule.parse3ds).mock.calls[0][0])).toEqual([9, 8]);
    expect(loaded).toBe(document);
  });
});
