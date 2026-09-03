import * as netModule from '@flighthq/net/contract';
import * as scene3dFormatsModule from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromObjUrl } from './objLoad';

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

function okResponse(body: string): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

beforeEach(() => {
  vi.spyOn(netModule, 'sendNetRequest').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsModule, 'parseObj').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene3DDocumentFromObjUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(scene3dFormatsModule.parseObj).mockReturnValue(document);
    vi.mocked(netModule.sendNetRequest).mockResolvedValue(okResponse('v 0 0 0'));

    const loaded = await loadScene3DDocumentFromObjUrl(fakeHost(), 'model.obj');

    expect(scene3dFormatsModule.parseObj).toHaveBeenCalledWith('v 0 0 0', undefined);
    expect(loaded).toBe(document);
  });
});
