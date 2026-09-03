import { connectSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  HasNetHttp,
  NetBackend,
  NetResponse,
  Scene3DDocument,
  Scene3DDocumentLoadProgress,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, ImageResourceReferenceKind, ResourceResolutionState } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getScene3DDocumentBasePathFromUrl,
  loadScene3DDocumentBytesFromUrl,
  loadScene3DDocumentTextFromUrl,
  setScene3DDocumentResourceBasePathFromUrl,
} from './sceneDocumentSource';

function fakeNetHost(backend: Omit<NetBackend, typeof EntityRuntimeKey>): HasNetHttp {
  return { net: { http: { ...backend, [EntityRuntimeKey]: undefined } } };
}

function okResponse(body: string | ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

function failResponse(): NetResponse {
  return { body: null, headers: {}, ok: false, status: 404, statusText: 'Not Found', url: 'u' };
}

describe('getScene3DDocumentBasePathFromUrl', () => {
  it('returns the containing path without query or fragment data', () => {
    expect(getScene3DDocumentBasePathFromUrl('models/ship.gltf?cache=1')).toBe('models');
    expect(getScene3DDocumentBasePathFromUrl('ship.gltf')).toBeNull();
  });
});

describe('loadScene3DDocumentBytesFromUrl', () => {
  it('forwards cancellation and identifies byte-progress events by URL', async () => {
    const controller = new AbortController();
    const events: Scene3DDocumentLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DDocumentLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));
    const host = fakeNetHost({
      sendNetRequest: async (_request, options) => {
        expect(options?.signal).toBe(controller.signal);
        emitSignal(options!.progress!, { loaded: 2, phase: 'download', total: 3 });
        return okResponse(new Uint8Array([1, 2, 3]).buffer);
      },
    });

    const bytes = await loadScene3DDocumentBytesFromUrl(host, 'model.bin', { progress, signal: controller.signal });

    expect(Array.from(bytes!)).toEqual([1, 2, 3]);
    expect(events).toEqual([{ loaded: 2, phase: 'download', total: 3, url: 'model.bin' }]);
  });

  it('returns null on an expected transport failure', async () => {
    const host = fakeNetHost({ sendNetRequest: async () => failResponse() });
    await expect(loadScene3DDocumentBytesFromUrl(host, 'missing.bin')).resolves.toBeNull();
  });
});

describe('loadScene3DDocumentTextFromUrl', () => {
  it('fetches the URL as text and returns the string', async () => {
    let requestedType: string | undefined;
    const host = fakeNetHost({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse('v 0 0 0');
      },
    });

    await expect(loadScene3DDocumentTextFromUrl(host, 'model.obj')).resolves.toBe('v 0 0 0');
    expect(requestedType).toBe('text');
  });

  it('returns null on an expected transport failure', async () => {
    const host = fakeNetHost({ sendNetRequest: async () => failResponse() });
    await expect(loadScene3DDocumentTextFromUrl(host, 'missing.obj')).resolves.toBeNull();
  });
});

describe('setScene3DDocumentResourceBasePathFromUrl', () => {
  it('sets only unresolved relative resources whose parser did not already supply a base path', () => {
    const document = {
      animations: [],
      cameras: [],
      lights: [],
      materials: [],
      meshes: [],
      metadata: null,
      nodes: [],
      scenes: [],
      skins: [],
      resources: [
        {
          basePath: null,
          failure: null,
          kind: ImageResourceReferenceKind.External,
          mimeType: null,
          state: ResourceResolutionState.Unresolved,
          uri: 'skin.png',
        },
        {
          basePath: 'authored',
          failure: null,
          kind: ImageResourceReferenceKind.External,
          mimeType: null,
          state: ResourceResolutionState.Unresolved,
          uri: 'fixed.png',
        },
      ],
    } satisfies Scene3DDocument;

    setScene3DDocumentResourceBasePathFromUrl(document, 'models/ship.obj');

    expect(document.resources[0].basePath).toBe('models');
    expect(document.resources[1].basePath).toBe('authored');
  });
});
