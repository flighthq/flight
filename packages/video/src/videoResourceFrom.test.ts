import {
  createVideoResourceFromMediaStream,
  loadVideoResourceFromBlob,
  loadVideoResourceFromUrl,
  loadVideoResourceFromUrls,
} from './videoResourceFrom';

// Capture every <video> the loaders create so tests can drive its media events synchronously.
let created: HTMLVideoElement[];

beforeEach(() => {
  created = [];
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = original(tag, options);
    if (tag === 'video') created.push(element as HTMLVideoElement);
    return element;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastVideo(): HTMLVideoElement {
  return created[created.length - 1];
}

describe('createVideoResourceFromMediaStream', () => {
  it('wraps a MediaStream by assigning it to srcObject', () => {
    const stream = {} as MediaStream;
    const resource = createVideoResourceFromMediaStream(stream);
    expect(resource.element).not.toBeNull();
    expect((resource.element as HTMLVideoElement).srcObject).toBe(stream);
  });
});

describe('loadVideoResourceFromBlob', () => {
  it('revokes the object URL after a successful load', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const promise = loadVideoResourceFromBlob(new Blob([], { type: 'video/mp4' }));
    lastVideo().dispatchEvent(new Event('canplay'));
    await promise;
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
  });

  it('revokes the object URL even when the load fails', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const promise = loadVideoResourceFromBlob(new Blob([], { type: 'video/mp4' }));
    lastVideo().dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('Failed to load video');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
  });
});

describe('loadVideoResourceFromUrl', () => {
  it('returns a Promise', () => {
    const result = loadVideoResourceFromUrl('test.mp4');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });

  it('defaults preload to auto and resolves on canplay when options are omitted', async () => {
    const promise = loadVideoResourceFromUrl('test.mp4');
    const element = lastVideo();
    expect(element.preload).toBe('auto');
    element.dispatchEvent(new Event('canplay'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });

  it('applies crossOrigin, muted, and preload from options', async () => {
    const promise = loadVideoResourceFromUrl('test.mp4', {
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
    const promise = loadVideoResourceFromUrl('test.mp4', { readiness: 'metadata' });
    const element = lastVideo();
    element.dispatchEvent(new Event('loadedmetadata'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });

  it('resolves on canplaythrough when readiness is "canplaythrough"', async () => {
    const promise = loadVideoResourceFromUrl('test.mp4', { readiness: 'canplaythrough' });
    const element = lastVideo();
    element.dispatchEvent(new Event('canplaythrough'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });

  it('rejects when the element emits an error', async () => {
    const promise = loadVideoResourceFromUrl('bad.mp4');
    lastVideo().dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('Failed to load video: bad.mp4');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('pre-aborted'));
    await expect(loadVideoResourceFromUrl('test.mp4', undefined, controller.signal)).rejects.toThrow('pre-aborted');
  });

  it('rejects when the signal is aborted after the call', async () => {
    const controller = new AbortController();
    const promise = loadVideoResourceFromUrl('test.mp4', undefined, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(promise).rejects.toThrow('cancelled');
  });

  // The two rejection paths are the only ones that abandon an element the loader created; on success
  // the caller takes ownership. Both are covered because a release sequence that is right on one
  // abandonment path and absent on the other still leaks a decoder.
  it('detaches the src and reloads the element it abandons when the load fails', async () => {
    const promise = loadVideoResourceFromUrl('bad.mp4');
    const element = lastVideo();
    const loadSpy = vi.spyOn(element, 'load').mockImplementation(() => {});
    element.dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('Failed to load video');
    expect(element.hasAttribute('src')).toBe(false);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('detaches the src and reloads the element it abandons when the signal is aborted', async () => {
    const controller = new AbortController();
    const promise = loadVideoResourceFromUrl('clip.mp4', undefined, controller.signal);
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
    const resource = await loadVideoResourceFromUrls([]);
    expect(resource.element).toBeNull();
  });

  it('resolves to a null-element resource when no source is playable in jsdom', async () => {
    const resource = await loadVideoResourceFromUrls([{ url: 'test.mp4' }]);
    expect(resource.element).toBeNull();
  });

  it('loads the first playable source', async () => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue('probably');
    const promise = loadVideoResourceFromUrls([{ url: 'clip.mp4' }]);
    const element = lastVideo();
    element.dispatchEvent(new Event('canplay'));
    const resource = await promise;
    expect(resource.element).toBe(element);
  });
});
