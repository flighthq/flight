import {
  createVideoResource,
  disposeVideoResource,
  getVideoResourceDuration,
  getVideoResourceHeight,
  getVideoResourceWidth,
  hasVideoResourceElement,
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
  });

  it('stores the provided video element', () => {
    const element = document.createElement('video');
    const resource = createVideoResource(element);
    expect(resource.element).toBe(element);
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
