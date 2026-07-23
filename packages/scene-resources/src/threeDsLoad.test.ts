import type * as NetModule from '@flighthq/net';
import type * as SceneFormatsModule from '@flighthq/scene-formats';
import type { NetResponse, SceneDocument } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as Load3dsModule from './threeDsLoad';

let loadSceneDocumentFrom3dsUrl: typeof Load3dsModule.loadSceneDocumentFrom3dsUrl;
let parse3ds: Mock<typeof SceneFormatsModule.parse3ds>;
let sendNetRequest: Mock<typeof NetModule.sendNetRequest>;

function emptyDocument(): SceneDocument {
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
  parse3ds = vi.fn<typeof SceneFormatsModule.parse3ds>();
  sendNetRequest = vi.fn<typeof NetModule.sendNetRequest>();
  vi.doMock('@flighthq/net', () => ({ sendNetRequest }));
  vi.doMock('@flighthq/scene-formats', () => ({ parse3ds }));
  ({ loadSceneDocumentFrom3dsUrl } = await import('./threeDsLoad'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/net');
  vi.doUnmock('@flighthq/scene-formats');
  vi.resetModules();
});

afterEach(() => {
  parse3ds.mockReset();
  sendNetRequest.mockReset();
});

describe('loadSceneDocumentFrom3dsUrl', () => {
  it('fetches bytes and returns the parsed CPU document without resolving resources', async () => {
    const document = emptyDocument();
    parse3ds.mockReturnValue(document);
    sendNetRequest.mockResolvedValue(okResponse(new Uint8Array([9, 8]).buffer));

    const loaded = await loadSceneDocumentFrom3dsUrl('model.3ds');

    expect(Array.from(parse3ds.mock.calls[0][0])).toEqual([9, 8]);
    expect(loaded).toBe(document);
  });
});
