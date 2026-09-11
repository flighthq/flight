import * as netModule from '@flighthq/net/contract';
import * as scene3dFormatsModule from '@flighthq/scene3d-formats/contract';
import type { HostNetProvider, NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromMd5MeshUrl } from './md5Load';

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

function fakeHost(): { readonly net: { readonly http: HostNetProvider } } {
  const host: { readonly net: { readonly http: HostNetProvider } } = {
    net: {
      http: {
        [EntityRuntimeKey]: undefined,
        sendNetRequest: (request, options) => netModule.sendNetRequest(host.net.http, request, options),
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
  vi.spyOn(scene3dFormatsModule, 'parseMd5Mesh').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene3DDocumentFromMd5MeshUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    vi.mocked(scene3dFormatsModule.parseMd5Mesh).mockReturnValue(document);
    vi.mocked(netModule.sendNetRequest).mockResolvedValue(okResponse('MD5Version 10'));

    const loaded = await loadScene3DDocumentFromMd5MeshUrl(fakeHost().net.http, 'model.md5mesh');

    expect(scene3dFormatsModule.parseMd5Mesh).toHaveBeenCalledWith('MD5Version 10');
    expect(loaded).toBe(document);
  });
});
