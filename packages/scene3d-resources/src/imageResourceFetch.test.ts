import type * as ImageModule from '@flighthq/image/contract';
import type { ExternalImageResourceReference, Image } from '@flighthq/types/contract';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWebImageResource, resolveImageResourceUri } from './imageResourceFetch';

const mocks = vi.hoisted(() => ({
  loadFromUrl: vi.fn<typeof ImageModule.loadImageResourceFromUrl>(),
}));

vi.mock('@flighthq/image/contract', () => ({
  loadImageResourceFromBytes: vi.fn(),
  loadImageResourceFromUrl: mocks.loadFromUrl,
}));

const fakeImage = { height: 1, width: 1 } as unknown as Image;

function externalRef(uri: string, basePath: string | null): ExternalImageResourceReference {
  return {
    basePath,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
}

afterEach(() => {
  mocks.loadFromUrl.mockReset();
});

describe('fetchWebImageResource', () => {
  it('fetches the resolved URL and returns the decoded image', async () => {
    mocks.loadFromUrl.mockResolvedValue(fakeImage);
    const result = await fetchWebImageResource(
      externalRef('leaf.png', 'assets/textures'),
      new AbortController().signal,
    );
    expect(mocks.loadFromUrl).toHaveBeenCalledWith('assets/textures/leaf.png', undefined, expect.anything());
    expect(result).toBe(fakeImage);
  });

  it('returns null on a non-abort failure', async () => {
    mocks.loadFromUrl.mockRejectedValue(new Error('404'));
    const result = await fetchWebImageResource(externalRef('missing.png', null), new AbortController().signal);
    expect(result).toBeNull();
  });

  it('rethrows when the signal aborted (a cancellation, not a failure)', async () => {
    const controller = new AbortController();
    controller.abort();
    mocks.loadFromUrl.mockRejectedValue(new Error('aborted'));
    await expect(fetchWebImageResource(externalRef('x.png', null), controller.signal)).rejects.toThrow();
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
