import { loadImageResourceFromUrl } from '@flighthq/image';
import type { ExternalSceneResourceRef, ImageResource } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebSceneResourceFetch, resolveSceneResourceUri } from './sceneResourceFetch';

vi.mock('@flighthq/image', () => ({
  loadImageResourceFromBytes: vi.fn(),
  loadImageResourceFromUrl: vi.fn(),
}));

const loadFromUrl = vi.mocked(loadImageResourceFromUrl);
const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function externalRef(uri: string, basePath: string | null): ExternalSceneResourceRef {
  return {
    basePath,
    kind: SceneResourceRefKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('createWebSceneResourceFetch', () => {
  it('fetches the resolved URL and returns the decoded image', async () => {
    loadFromUrl.mockResolvedValue(fakeImage);
    const fetch = createWebSceneResourceFetch();
    const result = await fetch(externalRef('leaf.png', 'assets/textures'), new AbortController().signal);
    expect(loadFromUrl).toHaveBeenCalledWith('assets/textures/leaf.png', undefined, expect.anything());
    expect(result).toBe(fakeImage);
  });

  it('returns null on a non-abort failure', async () => {
    loadFromUrl.mockRejectedValue(new Error('404'));
    const fetch = createWebSceneResourceFetch();
    const result = await fetch(externalRef('missing.png', null), new AbortController().signal);
    expect(result).toBeNull();
  });

  it('rethrows when the signal aborted (a cancellation, not a failure)', async () => {
    const controller = new AbortController();
    controller.abort();
    loadFromUrl.mockRejectedValue(new Error('aborted'));
    const fetch = createWebSceneResourceFetch();
    await expect(fetch(externalRef('x.png', null), controller.signal)).rejects.toThrow();
  });
});

describe('resolveSceneResourceUri', () => {
  it('joins a relative uri to a base path', () => {
    expect(resolveSceneResourceUri('leaf.png', 'assets/tex')).toBe('assets/tex/leaf.png');
  });

  it('does not double the separator when the base ends with a slash', () => {
    expect(resolveSceneResourceUri('leaf.png', 'assets/tex/')).toBe('assets/tex/leaf.png');
  });

  it('keeps a scheme-absolute uri verbatim', () => {
    expect(resolveSceneResourceUri('https://cdn.test/leaf.png', 'assets/tex')).toBe('https://cdn.test/leaf.png');
  });

  it('keeps a data uri verbatim', () => {
    expect(resolveSceneResourceUri('data:image/png;base64,AAAA', 'assets/tex')).toBe('data:image/png;base64,AAAA');
  });

  it('keeps a root-absolute uri verbatim', () => {
    expect(resolveSceneResourceUri('/textures/leaf.png', 'assets/tex')).toBe('/textures/leaf.png');
  });

  it('returns a relative uri unchanged when the base path is null', () => {
    expect(resolveSceneResourceUri('leaf.png', null)).toBe('leaf.png');
  });
});
