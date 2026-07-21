import type * as ImageModule from '@flighthq/image';
import type { ExternalImageResourceReference, ImageResource } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ImageResourceFetchModule from './imageResourceFetch';

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;
type LoadImageResourceFromUrl = typeof ImageModule.loadImageResourceFromUrl;

let createWebImageResourceFetch: typeof ImageResourceFetchModule.createWebImageResourceFetch;
let loadFromUrl: Mock<LoadImageResourceFromUrl>;
let resolveImageResourceUri: typeof ImageResourceFetchModule.resolveImageResourceUri;

function externalRef(uri: string, basePath: string | null): ExternalImageResourceReference {
  return {
    basePath,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
}

beforeAll(async () => {
  vi.resetModules();
  loadFromUrl = vi.fn<LoadImageResourceFromUrl>();
  vi.doMock('@flighthq/image', () => ({
    loadImageResourceFromBytes: vi.fn(),
    loadImageResourceFromUrl: loadFromUrl,
  }));
  ({ createWebImageResourceFetch, resolveImageResourceUri } = await import('./imageResourceFetch'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/image');
  vi.resetModules();
});

afterEach(() => {
  loadFromUrl.mockReset();
});

describe('createWebImageResourceFetch', () => {
  it('fetches the resolved URL and returns the decoded image', async () => {
    loadFromUrl.mockResolvedValue(fakeImage);
    const fetch = createWebImageResourceFetch();
    const result = await fetch(externalRef('leaf.png', 'assets/textures'), new AbortController().signal);
    expect(loadFromUrl).toHaveBeenCalledWith('assets/textures/leaf.png', undefined, expect.anything());
    expect(result).toBe(fakeImage);
  });

  it('returns null on a non-abort failure', async () => {
    loadFromUrl.mockRejectedValue(new Error('404'));
    const fetch = createWebImageResourceFetch();
    const result = await fetch(externalRef('missing.png', null), new AbortController().signal);
    expect(result).toBeNull();
  });

  it('rethrows when the signal aborted (a cancellation, not a failure)', async () => {
    const controller = new AbortController();
    controller.abort();
    loadFromUrl.mockRejectedValue(new Error('aborted'));
    const fetch = createWebImageResourceFetch();
    await expect(fetch(externalRef('x.png', null), controller.signal)).rejects.toThrow();
  });
});

describe('resolveImageResourceUri', () => {
  it('joins a relative uri to a base path', () => {
    expect(resolveImageResourceUri('leaf.png', 'assets/tex')).toBe('assets/tex/leaf.png');
  });

  it('does not double the separator when the base ends with a slash', () => {
    expect(resolveImageResourceUri('leaf.png', 'assets/tex/')).toBe('assets/tex/leaf.png');
  });

  it('keeps a scheme-absolute uri verbatim', () => {
    expect(resolveImageResourceUri('https://cdn.test/leaf.png', 'assets/tex')).toBe('https://cdn.test/leaf.png');
  });

  it('keeps a data uri verbatim', () => {
    expect(resolveImageResourceUri('data:image/png;base64,AAAA', 'assets/tex')).toBe('data:image/png;base64,AAAA');
  });

  it('keeps a root-absolute uri verbatim', () => {
    expect(resolveImageResourceUri('/textures/leaf.png', 'assets/tex')).toBe('/textures/leaf.png');
  });

  it('returns a relative uri unchanged when the base path is null', () => {
    expect(resolveImageResourceUri('leaf.png', null)).toBe('leaf.png');
  });
});
