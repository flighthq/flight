import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type { NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromMd2Url } from './md2Load';

// This file runs in the isolated tier (scripts/registryIsolatedTests.ts), so the module registry is
// already private to it and a top-level `vi.mock` is the sanctioned form here. It previously bought that
// same hermeticity by hand — `vi.resetModules()` plus `vi.doMock` plus a dynamic re-import inside
// `beforeAll` — which rebuilds this subject's whole transitive module graph on every run, inside a FIXED
// 60s hook deadline. That is unbounded work under a fixed budget, and it stopped fitting: the hook timed
// out and the file failed as a SUITE with zero failing tests, the exact presentation
// agents/conventions/testing.md predicts for this pattern.
//
// The mocks are established ONCE for the file and never re-registered per test, which is what makes the
// hoisted form expressible here. A file that re-mocks DIFFERENTLY PER TEST genuinely needs resetModules
// plus a dynamic import, and must not be converted this way.
const mocks = vi.hoisted(() => ({
  parseMd2: vi.fn<typeof Scene3DFormatsModule.parseMd2>(),
  sendNetRequest: vi.fn<typeof NetModule.sendNetRequest>(),
}));

vi.mock('@flighthq/net/contract', () => ({ sendNetRequest: mocks.sendNetRequest }));
vi.mock('@flighthq/scene3d-formats/contract', () => ({ parseMd2: mocks.parseMd2 }));

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

afterEach(() => {
  mocks.parseMd2.mockReset();
  mocks.sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFromMd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    mocks.parseMd2.mockReturnValue(document);
    mocks.sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([7]).buffer));

    const loaded = await loadScene3DDocumentFromMd2Url('model.md2');

    expect(Array.from(mocks.parseMd2.mock.calls[0][0])).toEqual([7]);
    expect(loaded).toBe(document);
  });
});
