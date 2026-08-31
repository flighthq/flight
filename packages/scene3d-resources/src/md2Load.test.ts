import * as netContract from '@flighthq/net/contract';
import * as scene3dFormatsContract from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromMd2Url } from './md2Load';

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
    net: { http: { sendNetRequest: (request, options) => netContract.sendNetRequest(host, request, options) } },
  };
  return host;
}

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

beforeEach(() => {
  vi.spyOn(netContract, 'sendNetRequest').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsContract, 'parseMd2').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene3DDocumentFromMd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(scene3dFormatsContract.parseMd2).mockReturnValue(document);
    vi.mocked(netContract.sendNetRequest).mockResolvedValue(okResponse(new Uint8Array([7]).buffer));

    const loaded = await loadScene3DDocumentFromMd2Url(fakeHost(), 'model.md2');

    expect(Array.from(vi.mocked(scene3dFormatsContract.parseMd2).mock.calls[0][0])).toEqual([7]);
    expect(loaded).toBe(document);
  });
});
