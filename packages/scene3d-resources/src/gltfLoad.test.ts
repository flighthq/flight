import * as netContract from '@flighthq/net/contract';
import * as scene3dFormatsContract from '@flighthq/scene3d-formats/contract';
import type {
  GltfCoreFeatureHandler,
  GltfExtensionHandler,
  HostNetCapability,
  ImportDiagnostic,
  NetResponse,
  Scene3DDocument,
} from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers,
  loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers,
} from './gltfLoad.ts';

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

function fakeHost(): { readonly net: { readonly http: HostNetCapability } } {
  const host: { readonly net: { readonly http: HostNetCapability } } = {
    net: {
      http: {
        sendNetRequest: (request, options) => netContract.sendNetRequest(host.net.http, request, options),
      },
    },
  };
  return host;
}

function response(body: string | ArrayBuffer, url = 'u'): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url };
}

beforeEach(() => {
  vi.spyOn(netContract, 'sendNetRequest').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsContract, 'parseGlbWithCoreFeatureHandlers').mockImplementation((() => {}) as never);
  vi.spyOn(scene3dFormatsContract, 'parseGltfWithCoreFeatureHandlers').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers', () => {
  it('passes the caller-owned core feature handlers to the selective parser', async () => {
    const document = emptyDocument();
    const diagnostics: ImportDiagnostic[] = [];
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'animations' }];
    const extensionHandlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];
    vi.mocked(scene3dFormatsContract.parseGlbWithCoreFeatureHandlers).mockReturnValue(document);
    vi.mocked(netContract.sendNetRequest).mockResolvedValue(response(new Uint8Array([1, 2]).buffer));

    const loaded = await loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(
      fakeHost().net.http,
      'models/ship.glb',
      handlers,
      { diagnostics, extensionHandlers },
    );

    const call = vi.mocked(scene3dFormatsContract.parseGlbWithCoreFeatureHandlers).mock.calls[0];
    expect(Array.from(call[0])).toEqual([1, 2]);
    expect(call[1]).toBe(handlers);
    expect(call[2]).toBe(diagnostics);
    expect(call[3]).toEqual({ basePath: 'models', extensionHandlers });
    expect(loaded).toBe(document);
  });

  it('accepts an empty handler list for a minimal parse', async () => {
    const document = emptyDocument();
    vi.mocked(scene3dFormatsContract.parseGlbWithCoreFeatureHandlers).mockReturnValue(document);
    vi.mocked(netContract.sendNetRequest).mockResolvedValue(response(new Uint8Array([5]).buffer));

    await loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(fakeHost().net.http, 'a.glb', []);

    const call = vi.mocked(scene3dFormatsContract.parseGlbWithCoreFeatureHandlers).mock.calls[0];
    expect(call[1]).toEqual([]);
  });

  it('returns null on transport failure without calling the parser', async () => {
    vi.mocked(netContract.sendNetRequest).mockResolvedValue({
      body: null,
      headers: {},
      ok: false,
      status: 404,
      statusText: 'x',
      url: 'u',
    });

    await expect(
      loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(fakeHost().net.http, 'missing.glb', []),
    ).resolves.toBeNull();
    expect(scene3dFormatsContract.parseGlbWithCoreFeatureHandlers).not.toHaveBeenCalled();
  });
});

describe('loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers', () => {
  it('passes caller-owned core feature handlers through the glTF text path', async () => {
    const document = emptyDocument();
    const diagnostics: ImportDiagnostic[] = [];
    const handlers: GltfCoreFeatureHandler[] = [{ apply() {}, kind: 'cameras' }];
    vi.mocked(scene3dFormatsContract.parseGltfWithCoreFeatureHandlers).mockReturnValue(document);
    vi.mocked(netContract.sendNetRequest).mockImplementation(async (_host, request) => {
      return request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"data.bin"}]}')
        : response(new Uint8Array([3, 4]).buffer);
    });

    const loaded = await loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers(
      fakeHost().net.http,
      'models/ship.gltf',
      handlers,
      { diagnostics },
    );

    const call = vi.mocked(scene3dFormatsContract.parseGltfWithCoreFeatureHandlers).mock.calls[0];
    expect(call[1]).toBe(handlers);
    expect(call[2]).toBe(diagnostics);
    expect(call[3]).toEqual({
      basePath: 'models',
      externalBuffers: { 'data.bin': new Uint8Array([3, 4]) },
    });
    expect(loaded).toBe(document);
  });

  it('returns null on invalid JSON without calling the parser', async () => {
    vi.mocked(netContract.sendNetRequest).mockResolvedValue(response('{'));
    await expect(
      loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers(fakeHost().net.http, 'broken.gltf', []),
    ).resolves.toBeNull();
    expect(scene3dFormatsContract.parseGltfWithCoreFeatureHandlers).not.toHaveBeenCalled();
  });
});
