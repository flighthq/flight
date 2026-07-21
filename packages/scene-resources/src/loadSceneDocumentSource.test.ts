import { setNetBackend } from '@flighthq/net';
import type { NetResponse } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createEmptySceneDocument, loadSceneDocumentBytes, loadSceneDocumentText } from './loadSceneDocumentSource';

function okResponse(body: string | ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

function failResponse(): NetResponse {
  return { body: null, headers: {}, ok: false, status: 404, statusText: 'Not Found', url: 'u' };
}

afterEach(() => {
  setNetBackend(null);
});

describe('createEmptySceneDocument', () => {
  it('returns every table present and empty', () => {
    const doc = createEmptySceneDocument();
    expect(doc.nodes).toHaveLength(0);
    expect(doc.meshes).toHaveLength(0);
    expect(doc.materials).toHaveLength(0);
    expect(doc.skins).toHaveLength(0);
    expect(doc.animations).toHaveLength(0);
    expect(doc.cameras).toHaveLength(0);
    expect(doc.lights).toHaveLength(0);
    expect(doc.resources).toHaveLength(0);
    expect(doc.scenes).toHaveLength(0);
    expect(doc.metadata).toBeNull();
  });
});

describe('loadSceneDocumentBytes', () => {
  it('fetches the URL as arraybuffer and returns the bytes on a 2xx response', async () => {
    let requestedType: string | undefined;
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse(buffer);
      },
    });
    const bytes = await loadSceneDocumentBytes('model.bin', 'loadX');
    expect(requestedType).toBe('arraybuffer');
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual([1, 2, 3]);
  });

  it('returns null and pushes a warning on a failed response', async () => {
    setNetBackend({ sendNetRequest: async () => failResponse() });
    const warnings: string[] = [];
    const bytes = await loadSceneDocumentBytes('missing.bin', 'loadX', warnings);
    expect(bytes).toBeNull();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('loadX');
  });
});

describe('loadSceneDocumentText', () => {
  it('fetches the URL as text and returns the string on a 2xx response', async () => {
    let requestedType: string | undefined;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse('v 0 0 0');
      },
    });
    const text = await loadSceneDocumentText('model.obj', 'loadX');
    expect(requestedType).toBe('text');
    expect(text).toBe('v 0 0 0');
  });

  it('returns null and pushes a warning on a failed response', async () => {
    setNetBackend({ sendNetRequest: async () => failResponse() });
    const warnings: string[] = [];
    const text = await loadSceneDocumentText('missing.obj', 'loadX', warnings);
    expect(text).toBeNull();
    expect(warnings.length).toBe(1);
  });
});
