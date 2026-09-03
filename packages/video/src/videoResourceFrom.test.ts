import type { VideoCapabilityBackend } from '@flighthq/types/contract';

import {
  createVideoResourceFromMediaStream,
  loadVideoResourceFromBlob,
  loadVideoResourceFromUrl,
  loadVideoResourceFromUrls,
} from './videoResourceFrom';

let created: HTMLVideoElement[];

function trackingBackend(canPlay = false): VideoCapabilityBackend {
  return {
    canPlayType: () => canPlay,
    createVideoElement() {
      const element = document.createElement('video');
      created.push(element);
      return element;
    },
  };
}

const noElementBackend: VideoCapabilityBackend = { canPlayType: () => false };

beforeEach(() => {
  created = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastVideo(): HTMLVideoElement {
  return created[created.length - 1];
}

describe('createVideoResourceFromMediaStream', () => {
  it('wraps a MediaStream by assigning it to srcObject and marks the element as owned', () => {
    const stream = {} as MediaStream;
    const resource = createVideoResourceFromMediaStream(trackingBackend(), stream);
    expect(resource).not.toBeNull();
    expect(resource!.element).not.toBeNull();
    expect((resource!.element as HTMLVideoElement).srcObject).toBe(stream);
    expect(resource!.ownsElement).toBe(true);
  });

  it('returns null when the backend cannot create a video element', () => {
    const resource = createVideoResourceFromMediaStream(noElementBackend, {} as MediaStream);
    expect(resource).toBeNull();
  });
});

describe('loadVideoResourceFromBlob', () => {
  it('returns a resource still holding its live object URL after the load settles', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const promise = loadVideoResourceFromBlob(trackingBackend(), new Blob([], { type: 'video/mp4' }));
    lastVideo().dispatchEvent(new Event('canplay'));
    const resource = await promise;
    expect(resource.objectUrl).toBe('blob:mock');
    expect(resource.ownsElement).toBe(true);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it('keeps the object URL live when the load settles at metadata readiness', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const promise = loadVideoResourceFromBlob(trackingBackend(), new Blob([], { type: 'video/mp4' }), {
      readiness: 'metadata',
    });
    lastVideo().dispatchEvent(new Event('loadedmetadata'));
    const resource = await promise;
    expect(resource.objectUrl).toBe('blob:mock');
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it('revokes the object URL when the load fails, since no resource is returned to own it', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const promise = loadVideoResourceFromBlob(trackingBackend(), new Blob([], { type: 'video/mp4' }));
    lastVideo().dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('Failed to load video');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
  });

  it('revokes the object URL when the load is aborted, since no resource is returned to own it', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const controller = new AbortController();
    const promise = loadVideoResourceFromBlob(
      trackingBackend(),
      new Blob([], { type: 'video/mp4' }),
      undefined,
      controller.signal,
    );
    controller.abort(new Error('cancelled'));
    await expect(promise).rejects.toThrow('cancelled');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
  });
});

describe('loadVideoResourceFromUrl', () => {
  it('returns a Promise', () => {
    const result = loadVideoResourceFromUrl(trackingBackend(), 'test.mp4');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });

  it('defaults preload to auto and resolves on canplay when options are omitted', async () => {
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'test.mp4');
    const element = lastVideo();
    expect(element.preload).toBe('auto');
    element.dispatchEvent(new Event('canplay'));
    const resource = await promise;
    expect(resource.element).toBe(element);
    expect(resource.ownsElement).toBe(true);
  });

  it('rejects when the backend cannot create a video element', async () => {
    await expect(loadVideoResourceFromUrl(noElementBackend, 'test.mp4')).rejects.toThrow(
      'No video element backend available',
    );
  });

  it('applies crossOrigin, muted, and preload from options', async () => {
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'test.mp4', {
      crossOrigin: 'anonymous',
      muted: true,
      preload: 'metadata',
    });
    const element = lastVideo();
    expect(element.crossOrigin).toBe('anonymous');
    expect(element.muted).toBe(true);
    expect(element.preload).toBe('metadata');
    element.dispatchEvent(new Event('canplay'));
    await promise;
  });

  it('resolves on loadedmetadata when readiness is "metadata"', async () => {
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'test.mp4', { readiness: 'metadata' });
    const element = lastVideo();
    element.dispatchEvent(new Event('loadedmetadata'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });

  it('resolves on canplaythrough when readiness is "canplaythrough"', async () => {
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'test.mp4', { readiness: 'canplaythrough' });
    const element = lastVideo();
    element.dispatchEvent(new Event('canplaythrough'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });

  it('rejects when the element emits an error', async () => {
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'bad.mp4');
    lastVideo().dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('Failed to load video: bad.mp4');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('pre-aborted'));
    await expect(loadVideoResourceFromUrl(trackingBackend(), 'test.mp4', undefined, controller.signal)).rejects.toThrow(
      'pre-aborted',
    );
  });

  it('rejects when the signal is aborted after the call', async () => {
    const controller = new AbortController();
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'test.mp4', undefined, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(promise).rejects.toThrow('cancelled');
  });

  it('detaches the src and reloads the element it abandons when the load fails', async () => {
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'bad.mp4');
    const element = lastVideo();
    const loadSpy = vi.spyOn(element, 'load').mockImplementation(() => {});
    element.dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('Failed to load video');
    expect(element.hasAttribute('src')).toBe(false);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('detaches the src and reloads the element it abandons when the signal is aborted', async () => {
    const controller = new AbortController();
    const promise = loadVideoResourceFromUrl(trackingBackend(), 'clip.mp4', undefined, controller.signal);
    const element = lastVideo();
    const loadSpy = vi.spyOn(element, 'load').mockImplementation(() => {});
    controller.abort(new Error('cancelled'));
    await expect(promise).rejects.toThrow('cancelled');
    expect(element.hasAttribute('src')).toBe(false);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('loadVideoResourceFromUrls', () => {
  it('resolves immediately with a null-element resource when sources is empty', async () => {
    const resource = await loadVideoResourceFromUrls(noElementBackend, []);
    expect(resource.element).toBeNull();
  });

  it('resolves to a null-element resource when no source is playable', async () => {
    const resource = await loadVideoResourceFromUrls(noElementBackend, [{ url: 'test.mp4' }]);
    expect(resource.element).toBeNull();
  });

  it('loads the first playable source', async () => {
    const backend = trackingBackend(true);
    const promise = loadVideoResourceFromUrls(backend, [{ url: 'clip.mp4' }]);
    const element = lastVideo();
    element.dispatchEvent(new Event('canplay'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });
});
