import type * as NetModule from '@flighthq/net/contract';
import type * as Scene3DFormatsModule from '@flighthq/scene3d-formats/contract';
import type { HasNetHttp, NetResponse, Scene3DDocument } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadScene3DDocumentFromAwd2Url } from './awd2Load';

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
  parseAwd2: vi.fn<typeof Scene3DFormatsModule.parseAwd2>(),
  sendNetRequest: vi.fn<typeof NetModule.sendNetRequest>(),
}));

vi.mock('@flighthq/net/contract', () => ({ sendNetRequest: mocks.sendNetRequest }));
vi.mock('@flighthq/scene3d-formats/contract', () => ({ parseAwd2: mocks.parseAwd2 }));

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

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

afterEach(() => {
  mocks.parseAwd2.mockReset();
  mocks.sendNetRequest.mockReset();
});

describe('loadScene3DDocumentFromAwd2Url', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    mocks.parseAwd2.mockReturnValue(document);
    mocks.sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([5, 6]).buffer));

    const loaded = await loadScene3DDocumentFromAwd2Url(fakeHost(), 'model.awd');

    expect(Array.from(mocks.parseAwd2.mock.calls[0][0])).toEqual([5, 6]);
    expect(loaded).toBe(document);
  });
});
