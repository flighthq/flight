import { setNetBackend } from '@flighthq/net';
import { connectSignal, createSignal, emitSignal } from '@flighthq/signals';
import type { NetResponse, SceneDocument, SceneDocumentLoadProgress } from '@flighthq/types';
import { ImageResourceReferenceKind, ResourceResolutionState } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getSceneDocumentBasePathFromUrl,
  loadSceneDocumentBytesFromUrl,
  loadSceneDocumentTextFromUrl,
  setSceneDocumentResourceBasePathFromUrl,
} from './sceneDocumentSource';

function okResponse(body: string | ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

function failResponse(): NetResponse {
  return { body: null, headers: {}, ok: false, status: 404, statusText: 'Not Found', url: 'u' };
}

afterEach(() => {
  setNetBackend(null);
});

describe('getSceneDocumentBasePathFromUrl', () => {
  it('returns the containing path without query or fragment data', () => {
    expect(getSceneDocumentBasePathFromUrl('models/ship.gltf?cache=1')).toBe('models');
    expect(getSceneDocumentBasePathFromUrl('ship.gltf')).toBeNull();
  });
});

describe('loadSceneDocumentBytesFromUrl', () => {
  it('forwards cancellation and identifies byte-progress events by URL', async () => {
    const controller = new AbortController();
    const events: SceneDocumentLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<SceneDocumentLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));
    setNetBackend({
      sendNetRequest: async (_request, options) => {
        expect(options?.signal).toBe(controller.signal);
        emitSignal(options!.progress!, { loaded: 2, phase: 'download', total: 3 });
        return okResponse(new Uint8Array([1, 2, 3]).buffer);
      },
    });

    const bytes = await loadSceneDocumentBytesFromUrl('model.bin', { progress, signal: controller.signal });

    expect(Array.from(bytes!)).toEqual([1, 2, 3]);
    expect(events).toEqual([{ loaded: 2, phase: 'download', total: 3, url: 'model.bin' }]);
  });

  it('returns null on an expected transport failure', async () => {
    setNetBackend({ sendNetRequest: async () => failResponse() });
    await expect(loadSceneDocumentBytesFromUrl('missing.bin')).resolves.toBeNull();
  });
});

describe('loadSceneDocumentTextFromUrl', () => {
  it('fetches the URL as text and returns the string', async () => {
    let requestedType: string | undefined;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse('v 0 0 0');
      },
    });

    await expect(loadSceneDocumentTextFromUrl('model.obj')).resolves.toBe('v 0 0 0');
    expect(requestedType).toBe('text');
  });

  it('returns null on an expected transport failure', async () => {
    setNetBackend({ sendNetRequest: async () => failResponse() });
    await expect(loadSceneDocumentTextFromUrl('missing.obj')).resolves.toBeNull();
  });
});

describe('setSceneDocumentResourceBasePathFromUrl', () => {
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
    } satisfies SceneDocument;

    setSceneDocumentResourceBasePathFromUrl(document, 'models/ship.obj');

    expect(document.resources[0].basePath).toBe('models');
    expect(document.resources[1].basePath).toBe('authored');
  });
});
