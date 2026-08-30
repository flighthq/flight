import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromMd5MeshUrl } from './md5Load';

// This file runs in the isolated tier (scripts/registryIsolatedTests.ts), so the module registry is
// already private to it and a top-level `vi.mock` is the sanctioned form here. It previously bought
// that same hermeticity by hand — `vi.resetModules()` plus `vi.doMock` plus a dynamic re-import inside
// `beforeAll` — which rebuilds this subject's whole transitive module graph on every run, inside a
// FIXED 60s hook deadline. That is unbounded work under a fixed budget, and on 2026-08-13 it stopped
// fitting: the hook timed out and the file failed as a SUITE with zero failing tests, which is the
// exact presentation agents/conventions/testing.md predicts for this pattern.
//
// The mocks are established ONCE for the file and never re-registered per test, which is what makes
// the hoisted form expressible here. A file that re-mocks DIFFERENTLY PER TEST genuinely needs
// resetModules plus a dynamic import, and must not be converted this way.
const mocks = vi.hoisted(() => ({
  parseMd5Mesh: vi.fn<typeof Scene3DFormatsModule.parseMd5Mesh>(),
  sendNetRequest: vi.fn<typeof NetModule.sendNetRequest>(),
}));

vi.mock('@flighthq/net/contract', () => ({ sendNetRequest: mocks.sendNetRequest }));
vi.mock('@flighthq/scene3d-formats/contract', () => ({ parseMd5Mesh: mocks.parseMd5Mesh }));

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
  return { net: { http: { sendNetRequest: mocks.sendNetRequest } } };
}

function okResponse(body: string): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

afterEach(() => {
  mocks.parseMd5Mesh.mockReset();
  mocks.sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFromMd5MeshUrl', () => {
  it('fetches text and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    mocks.parseMd5Mesh.mockReturnValue(document);
    mocks.sendNetRequest.mockResolvedValue(okResponse('MD5Version 10'));

    const loaded = await loadScene3DDocumentFromMd5MeshUrl(fakeHost(), 'model.md5mesh');

    expect(mocks.parseMd5Mesh).toHaveBeenCalledWith('MD5Version 10');
    expect(loaded).toBe(document);
  });
});
