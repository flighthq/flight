import type { HostImageSource, HostVideoCapability } from '@flighthq/types/contract';

import { loadVideoResourceFromBlob, loadVideoResourceFromUrl, loadVideoResourceFromUrls } from './videoResourceFrom.ts';

const element = {} as HostImageSource;

function hostWithLoad(loadUrl = vi.fn(async () => element), canPlay = false): HostVideoCapability {
  return {
    canPlayType: () => canPlay,
    loadUrl,
  };
}

function hostWithObjectUrls(loadUrl = vi.fn(async () => element)): HostVideoCapability {
  return {
    canPlayType: () => false,
    createObjectUrl: vi.fn(() => 'blob:mock'),
    loadUrl,
    revokeObjectUrl: vi.fn(),
  };
}

describe('loadVideoResourceFromBlob', () => {
  it('returns an owned resource that keeps its object URL live after loading', async () => {
    const hostVideo = hostWithObjectUrls();

    const resource = await loadVideoResourceFromBlob(hostVideo, new Blob([], { type: 'video/mp4' }));

    expect(hostVideo.createObjectUrl).toHaveBeenCalledOnce();
    expect(hostVideo.loadUrl).toHaveBeenCalledWith('blob:mock', undefined, undefined);
    expect(hostVideo.revokeObjectUrl).not.toHaveBeenCalled();
    expect(resource).toMatchObject({ element, objectUrl: 'blob:mock', ownsElement: true });
  });

  it('forwards loading options and the abort signal through the URL loader', async () => {
    const hostVideo = hostWithObjectUrls();
    const options = { muted: true, readiness: 'metadata' } as const;
    const signal = new AbortController().signal;

    await loadVideoResourceFromBlob(hostVideo, new Blob(), options, signal);

    expect(hostVideo.loadUrl).toHaveBeenCalledWith('blob:mock', options, signal);
  });

  it('revokes the object URL when loading fails because no resource takes ownership', async () => {
    const error = new Error('Failed to load video');
    const hostVideo = hostWithObjectUrls(vi.fn().mockRejectedValue(error));

    await expect(loadVideoResourceFromBlob(hostVideo, new Blob())).rejects.toBe(error);
    expect(hostVideo.revokeObjectUrl).toHaveBeenCalledWith('blob:mock');
  });

  it('revokes the object URL when loading is aborted because no resource takes ownership', async () => {
    const error = new Error('cancelled');
    const hostVideo = hostWithObjectUrls(vi.fn().mockRejectedValue(error));
    const controller = new AbortController();
    controller.abort(error);

    await expect(loadVideoResourceFromBlob(hostVideo, new Blob(), undefined, controller.signal)).rejects.toBe(error);
    expect(hostVideo.revokeObjectUrl).toHaveBeenCalledWith('blob:mock');
  });

  it.each(['createObjectUrl', 'revokeObjectUrl'] as const)('rejects before loading without %s', async (missing) => {
    const hostVideo = hostWithObjectUrls();
    hostVideo[missing] = undefined;

    await expect(loadVideoResourceFromBlob(hostVideo, new Blob())).rejects.toThrow(
      'No video object URL backend available',
    );
    expect(hostVideo.loadUrl).not.toHaveBeenCalled();
  });
});

describe('loadVideoResourceFromUrl', () => {
  it('returns a Promise and wraps the provider result as an owned resource', async () => {
    const hostVideo = hostWithLoad();

    const result = loadVideoResourceFromUrl(hostVideo, 'test.mp4');

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toMatchObject({ element, objectUrl: null, ownsElement: true });
  });

  it('forwards the URL, options, and abort signal to the provider', async () => {
    const hostVideo = hostWithLoad();
    const options = { crossOrigin: 'anonymous', muted: true, playsInline: true, preload: 'metadata' } as const;
    const signal = new AbortController().signal;

    await loadVideoResourceFromUrl(hostVideo, 'test.mp4', options, signal);

    expect(hostVideo.loadUrl).toHaveBeenCalledWith('test.mp4', options, signal);
  });

  it('rejects when the provider has no URL loader', async () => {
    const hostVideo: HostVideoCapability = { canPlayType: () => false };

    await expect(loadVideoResourceFromUrl(hostVideo, 'test.mp4')).rejects.toThrow('No video element backend available');
  });

  it('preserves provider load failures', async () => {
    const error = new Error('Failed to load video: bad.mp4');
    const hostVideo = hostWithLoad(vi.fn().mockRejectedValue(error));

    await expect(loadVideoResourceFromUrl(hostVideo, 'bad.mp4')).rejects.toBe(error);
  });

  it('preserves provider abort failures', async () => {
    const error = new Error('cancelled');
    const hostVideo = hostWithLoad(vi.fn().mockRejectedValue(error));
    const controller = new AbortController();
    controller.abort(error);

    await expect(loadVideoResourceFromUrl(hostVideo, 'test.mp4', undefined, controller.signal)).rejects.toBe(error);
    expect(hostVideo.loadUrl).toHaveBeenCalledWith('test.mp4', undefined, controller.signal);
  });
});

describe('loadVideoResourceFromUrls', () => {
  it('resolves immediately with a null-element resource when sources is empty', async () => {
    const resource = await loadVideoResourceFromUrls(hostWithLoad(), []);

    expect(resource.element).toBeNull();
  });

  it('resolves to a null-element resource when no source is playable', async () => {
    const resource = await loadVideoResourceFromUrls(hostWithLoad(), [{ url: 'test.mp4' }]);

    expect(resource.element).toBeNull();
  });

  it('loads the first playable source through the provider', async () => {
    const hostVideo = hostWithLoad(
      vi.fn(async () => element),
      true,
    );

    const resource = await loadVideoResourceFromUrls(hostVideo, [{ url: 'clip.mp4' }]);

    expect(hostVideo.loadUrl).toHaveBeenCalledWith('clip.mp4', undefined, undefined);
    expect(resource.element).toBe(element);
  });
});
