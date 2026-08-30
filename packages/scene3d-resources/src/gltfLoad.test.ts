import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type {
  GltfExtensionHandler,
  HasNetHttp,
  ImportDiagnostic,
  NetResponse,
  Scene3DDocument,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromGlbUrl, loadScene3DDocumentFromGltfUrl } from './gltfLoad';

// This file runs in the isolated tier (scripts/registryIsolatedTests.ts), so the module registry is
// already private to it and a top-level `vi.mock` is the sanctioned form here. It previously bought that
// same hermeticity by hand — `vi.resetModules()` plus `vi.doMock` plus a dynamic re-import inside
// `beforeAll` — which rebuilds this subject's whole transitive module graph on every run, inside a FIXED
// 60s hook deadline: unbounded work under a fixed budget, which is why members of this cluster failed as
// SUITES with zero failing tests, the presentation agents/conventions/testing.md predicts.
//
// The mocks are established ONCE for the file and never re-registered per test, which is what makes the
// hoisted form expressible here. A file that re-mocks DIFFERENTLY PER TEST genuinely needs resetModules
// plus a dynamic import, and must not be converted this way.
const mocks = vi.hoisted(() => ({
  parseGlb: vi.fn<typeof Scene3DFormatsModule.parseGlb>(),
  parseGltf: vi.fn<typeof Scene3DFormatsModule.parseGltf>(),
  sendNetRequest: vi.fn<typeof NetModule.sendNetRequest>(),
}));

vi.mock('@flighthq/net/contract', () => ({ sendNetRequest: mocks.sendNetRequest }));
vi.mock('@flighthq/scene3d-formats/contract', () => ({ parseGlb: mocks.parseGlb, parseGltf: mocks.parseGltf }));

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
    net: { http: { sendNetRequest: (request, options) => mocks.sendNetRequest(host, request, options) } },
  };
  return host;
}

function response(body: string | ArrayBuffer, url = 'u'): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url };
}

afterEach(() => {
  mocks.parseGlb.mockReset();
  mocks.parseGltf.mockReset();
  mocks.sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFromGlbUrl', () => {
  it('fetches bytes, carries the source base path, and returns a CPU document', async () => {
    const document = emptyDocument();
    const diagnostics: ImportDiagnostic[] = [];
    const extensionHandlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];
    mocks.parseGlb.mockReturnValue(document);
    mocks.sendNetRequest.mockResolvedValue(response(new Uint8Array([1, 2, 3]).buffer));

    const loaded = await loadScene3DDocumentFromGlbUrl(fakeHost(), 'models/ship.glb', {
      diagnostics,
      extensionHandlers,
    });

    expect(Array.from(mocks.parseGlb.mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(mocks.parseGlb.mock.calls[0][1]).toBe(diagnostics);
    expect(mocks.parseGlb.mock.calls[0][2]).toEqual({ basePath: 'models', extensionHandlers });
    expect(mocks.parseGlb.mock.calls[0][2]?.extensionHandlers).toBe(extensionHandlers);
    expect(loaded).toBe(document);
  });

  it('returns null rather than an empty document on transport failure', async () => {
    mocks.sendNetRequest.mockResolvedValue({
      body: null,
      headers: {},
      ok: false,
      status: 404,
      statusText: 'x',
      url: 'u',
    });

    await expect(loadScene3DDocumentFromGlbUrl(fakeHost(), 'missing.glb')).resolves.toBeNull();
    expect(mocks.parseGlb).not.toHaveBeenCalled();
  });
});

describe('loadScene3DDocumentFromGltfUrl', () => {
  it('fetches external geometry buffers and supplies the image base path to parsing', async () => {
    const document = emptyDocument();
    const diagnostics: ImportDiagnostic[] = [];
    const extensionHandlers: GltfExtensionHandler[] = [{ apply() {}, kind: 'KHR_lights_punctual' }];
    mocks.parseGltf.mockReturnValue(document);
    const requested: string[] = [];
    mocks.sendNetRequest.mockImplementation(async (_host, request) => {
      requested.push(request.url);
      return request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"mesh.bin"}]}')
        : response(new Uint8Array([8, 9]).buffer);
    });

    const loaded = await loadScene3DDocumentFromGltfUrl(fakeHost(), 'models/ship.gltf', {
      diagnostics,
      extensionHandlers,
    });

    expect(requested).toEqual(['models/ship.gltf', 'models/mesh.bin']);
    expect(mocks.parseGltf.mock.calls[0][1]).toBe(diagnostics);
    expect(mocks.parseGltf.mock.calls[0][2]).toEqual({
      basePath: 'models',
      extensionHandlers,
      externalBuffers: { 'mesh.bin': new Uint8Array([8, 9]) },
    });
    expect(mocks.parseGltf.mock.calls[0][2]?.extensionHandlers).toBe(extensionHandlers);
    expect(loaded).toBe(document);
  });

  it('returns null when JSON or a required external buffer cannot load', async () => {
    mocks.sendNetRequest.mockResolvedValue(response('{'));
    await expect(loadScene3DDocumentFromGltfUrl(fakeHost(), 'broken.gltf')).resolves.toBeNull();

    mocks.sendNetRequest.mockImplementation(async (_host, request) =>
      request.url.endsWith('.gltf')
        ? response('{"asset":{"version":"2.0"},"buffers":[{"byteLength":2,"uri":"missing.bin"}]}')
        : { body: null, headers: {}, ok: false, status: 404, statusText: 'x', url: request.url },
    );
    await expect(loadScene3DDocumentFromGltfUrl(fakeHost(), 'models/ship.gltf')).resolves.toBeNull();
    expect(mocks.parseGltf).not.toHaveBeenCalled();
  });
});
