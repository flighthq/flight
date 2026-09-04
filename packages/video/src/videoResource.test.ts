import {
  createVideoResource,
  destroyVideoResource,
  disposeVideoResource,
  getVideoResourceDuration,
  getVideoResourceHeight,
  getVideoResourceWidth,
  hasVideoResourceElement,
  initializeVideoResource,
  isVideoResourceEmpty,
  isVideoResourceReady,
} from './videoResource';

// vi.spyOn hands back the *existing* spy when a method is already spied, so without this the URL
// spies below share one call history and every count assertion reads the previous test's calls too.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('createVideoResource', () => {
  it('returns a resource with null element when called with no arguments', () => {
    const resource = createVideoResource();
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('stores the provided video element as borrowed by default', () => {
    const element = document.createElement('video');
    const resource = createVideoResource(element);
    expect(resource.element).toBe(element);
    expect(resource.ownsElement).toBe(false);
  });

  it('marks element as owned when explicitly requested', () => {
    const element = document.createElement('video');
    const resource = createVideoResource(element, undefined, true);
    expect(resource.element).toBe(element);
    expect(resource.ownsElement).toBe(true);
  });
});

describe('destroyVideoResource', () => {
  it('releases an owned element by detaching src and reloading to free the decoder', () => {
    const removeAttribute = vi.fn();
    const load = vi.fn();
    const element = { removeAttribute, load, srcObject: null } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, undefined, true);

    destroyVideoResource(resource);

    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(load).toHaveBeenCalledOnce();
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('does not release a borrowed element — the caller manages its lifecycle', () => {
    const removeAttribute = vi.fn();
    const load = vi.fn();
    const element = { removeAttribute, load, srcObject: null } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element);

    destroyVideoResource(resource);

    expect(removeAttribute).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('clears srcObject on an owned MediaStream element without stopping caller-owned tracks', () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const element = {
      removeAttribute: vi.fn(),
      load: vi.fn(),
      srcObject: stream,
    } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, undefined, true);

    destroyVideoResource(resource);

    expect(element.srcObject).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('does not touch srcObject on a borrowed element', () => {
    const stream = {} as MediaStream;
    const element = {
      removeAttribute: vi.fn(),
      load: vi.fn(),
      srcObject: stream,
    } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element);

    destroyVideoResource(resource);

    expect(element.srcObject).toBe(stream);
  });

  it('revokes an owned object URL after the element has released its src', () => {
    const order: string[] = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => void order.push('revoke'));
    const element = {
      removeAttribute: vi.fn(() => void order.push('removeAttribute')),
      load: vi.fn(() => void order.push('load')),
      srcObject: null,
    } as unknown as HTMLVideoElement;

    destroyVideoResource(createVideoResource(element, 'blob:owned', true));

    expect(order).toEqual(['removeAttribute', 'load', 'revoke']);
  });

  it('revokes an object URL even when the element is borrowed', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = { srcObject: null } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, 'blob:owned');

    destroyVideoResource(resource);

    expect(revokeSpy).toHaveBeenCalledWith('blob:owned');
    expect(resource.objectUrl).toBeNull();
  });

  it('is idempotent — a second destruction is a no-op', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = {
      removeAttribute: vi.fn(),
      load: vi.fn(),
      srcObject: null,
    } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, 'blob:owned', true);

    destroyVideoResource(resource);
    destroyVideoResource(resource);

    expect(element.removeAttribute).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it('nulls the element so VideoChannel queries degrade to sentinels', () => {
    const element = {
      removeAttribute: vi.fn(),
      load: vi.fn(),
      srcObject: null,
    } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, undefined, true);

    destroyVideoResource(resource);

    expect(resource.element).toBeNull();
  });
});

describe('disposeVideoResource', () => {
  it('clears the src, reloads to release the decoder, and drops the element', () => {
    const removeAttribute = vi.fn();
    const load = vi.fn();
    const element = { removeAttribute, load } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element);

    disposeVideoResource(resource);

    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(load).toHaveBeenCalledOnce();
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('is a no-op on an already element-less resource', () => {
    const resource = createVideoResource();
    disposeVideoResource(resource);
    expect(resource.element).toBeNull();
  });

  it('revokes an owned object URL and clears it', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = { removeAttribute: vi.fn(), load: vi.fn() } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, 'blob:owned');

    disposeVideoResource(resource);

    expect(revokeSpy).toHaveBeenCalledWith('blob:owned');
    expect(resource.objectUrl).toBeNull();
  });

  // Revoking is what makes the Blob GC-eligible, so it must survive a second disposal without
  // double-revoking a URL the resource no longer owns.
  it('does not revoke again when disposed twice', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = { removeAttribute: vi.fn(), load: vi.fn() } as unknown as HTMLVideoElement;
    const resource = createVideoResource(element, 'blob:owned');

    disposeVideoResource(resource);
    disposeVideoResource(resource);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  // A resource built over a URL the caller manages must not have it revoked out from under them.
  it('revokes nothing when the resource owns no object URL', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = { removeAttribute: vi.fn(), load: vi.fn() } as unknown as HTMLVideoElement;

    disposeVideoResource(createVideoResource(element));

    expect(revokeSpy).not.toHaveBeenCalled();
  });

  // The element must let go of the src before the URL behind it is revoked, not after.
  it('revokes the object URL only after the element has released its src', () => {
    const order: string[] = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => void order.push('revoke'));
    const element = {
      removeAttribute: vi.fn(() => void order.push('removeAttribute')),
      load: vi.fn(() => void order.push('load')),
    } as unknown as HTMLVideoElement;

    disposeVideoResource(createVideoResource(element, 'blob:owned'));

    expect(order).toEqual(['removeAttribute', 'load', 'revoke']);
  });
});

describe('getVideoResourceDuration', () => {
  it('returns 0 when there is no element', () => {
    expect(getVideoResourceDuration(createVideoResource())).toBe(0);
  });

  it('reads duration from the element', () => {
    const element = { duration: 12.5 } as HTMLVideoElement;
    expect(getVideoResourceDuration(createVideoResource(element))).toBe(12.5);
  });
});

describe('getVideoResourceHeight', () => {
  it('returns 0 when there is no element', () => {
    expect(getVideoResourceHeight(createVideoResource())).toBe(0);
  });

  it('reads videoHeight from the element', () => {
    const element = { videoHeight: 480 } as HTMLVideoElement;
    expect(getVideoResourceHeight(createVideoResource(element))).toBe(480);
  });
});

describe('getVideoResourceWidth', () => {
  it('returns 0 when there is no element', () => {
    expect(getVideoResourceWidth(createVideoResource())).toBe(0);
  });

  it('reads videoWidth from the element', () => {
    const element = { videoWidth: 640 } as HTMLVideoElement;
    expect(getVideoResourceWidth(createVideoResource(element))).toBe(640);
  });
});

describe('hasVideoResourceElement', () => {
  it('is false without an element and true with one', () => {
    expect(hasVideoResourceElement(createVideoResource())).toBe(false);
    expect(hasVideoResourceElement(createVideoResource(document.createElement('video')))).toBe(true);
  });
});

describe('initializeVideoResource', () => {
  it('is the construction initializer of createVideoResource', () => {
    expect(typeof initializeVideoResource).toBe('function');
  });
});

describe('isVideoResourceEmpty', () => {
  it('is true when there is no element', () => {
    expect(isVideoResourceEmpty(createVideoResource())).toBe(true);
  });

  it('is true when the element has no decoded dimensions', () => {
    const element = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    expect(isVideoResourceEmpty(createVideoResource(element))).toBe(true);
  });

  it('is false once the element reports dimensions', () => {
    const element = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    expect(isVideoResourceEmpty(createVideoResource(element))).toBe(false);
  });
});
describe('isVideoResourceReady', () => {
  it('is false when there is no element', () => {
    expect(isVideoResourceReady(createVideoResource())).toBe(false);
  });

  it('is false while readyState is below HAVE_CURRENT_DATA', () => {
    const element = { readyState: 1 } as HTMLVideoElement;
    expect(isVideoResourceReady(createVideoResource(element))).toBe(false);
  });

  it('is true once readyState reaches HAVE_CURRENT_DATA', () => {
    const element = { readyState: 2 } as HTMLVideoElement;
    expect(isVideoResourceReady(createVideoResource(element))).toBe(true);
  });
});
