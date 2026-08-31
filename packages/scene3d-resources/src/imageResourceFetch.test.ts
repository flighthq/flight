import * as imageContract from '@flighthq/image/contract';
import type { ExternalImageResourceReference, Image } from '@flighthq/types/contract';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWebImageResource, resolveImageResourceUri } from './imageResourceFetch';

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

beforeEach(() => {
  vi.spyOn(imageContract, 'loadImageResourceFromUrl').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWebImageResource', () => {
  it('fetches the resolved URL and returns the decoded image', async () => {
    vi.mocked(imageContract.loadImageResourceFromUrl).mockResolvedValue(fakeImage);
    const result = await fetchWebImageResource(
      externalRef('leaf.png', 'assets/textures'),
      new AbortController().signal,
    );
    expect(imageContract.loadImageResourceFromUrl).toHaveBeenCalledWith(
      'assets/textures/leaf.png',
      undefined,
      expect.anything(),
    );
    expect(result).toBe(fakeImage);
  });

  it('returns null on a non-abort failure', async () => {
    vi.mocked(imageContract.loadImageResourceFromUrl).mockRejectedValue(new Error('404'));
    const result = await fetchWebImageResource(externalRef('missing.png', null), new AbortController().signal);
    expect(result).toBeNull();
  });

  it('rethrows when the signal aborted (a cancellation, not a failure)', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(imageContract.loadImageResourceFromUrl).mockRejectedValue(new Error('aborted'));
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
