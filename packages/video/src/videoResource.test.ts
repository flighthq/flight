import type { HostImageSource, HostVideoCapability } from '@flighthq/types/contract';

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
} from './videoResource.ts';

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

  it('stores the provided host video source as borrowed by default', () => {
    const source = videoSource();
    const resource = createVideoResource(source);
    expect(resource.element).toBe(source);
    expect(resource.ownsElement).toBe(false);
  });

  it('marks the source as owned when explicitly requested', () => {
    const source = videoSource();
    const resource = createVideoResource(source, undefined, true);
    expect(resource.element).toBe(source);
    expect(resource.ownsElement).toBe(true);
  });
});

describe('destroyVideoResource', () => {
  it('asks the host to release an owned source, detaching a live stream with it', () => {
    const host = fakeVideoHost();
    const source = videoSource();
    const resource = createVideoResource(source, undefined, true);

    destroyVideoResource(host.provider, resource);

    // releaseElement is what drops a live capture stream without stopping caller-owned tracks.
    expect(host.released).toEqual([source]);
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('does not release a borrowed source — the caller manages its lifecycle', () => {
    const host = fakeVideoHost();
    const resource = createVideoResource(videoSource());

    destroyVideoResource(host.provider, resource);

    expect(host.released).toEqual([]);
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('revokes an owned object URL after the host has released the element', () => {
    const host = fakeVideoHost();

    destroyVideoResource(host.provider, createVideoResource(videoSource(), 'blob:owned', true));

    // Order matters: the element must let go of its src before the URL behind it is revoked.
    expect(host.order).toEqual(['release', 'revoke']);
  });

  it('revokes an object URL even when the source is borrowed', () => {
    const host = fakeVideoHost();
    const resource = createVideoResource(videoSource(), 'blob:owned');

    destroyVideoResource(host.provider, resource);

    expect(host.revoked).toEqual(['blob:owned']);
    expect(resource.objectUrl).toBeNull();
  });

  it('is idempotent — a second destruction is a no-op', () => {
    const host = fakeVideoHost();
    const resource = createVideoResource(videoSource(), 'blob:owned', true);

    destroyVideoResource(host.provider, resource);
    destroyVideoResource(host.provider, resource);

    expect(host.released).toHaveLength(1);
    expect(host.revoked).toEqual(['blob:owned']);
  });

  // A host that carries no video capability answers by absence. Teardown must still drop the
  // resource's own state rather than throwing on the missing member.
  it('still clears the resource when the host carries no release capability', () => {
    const resource = createVideoResource(videoSource(), 'blob:owned', true);

    expect(() => destroyVideoResource(emptyVideoHost(), resource)).not.toThrow();
    expect(resource.element).toBeNull();
    // The URL is forgotten even when no host can revoke it — the resource must not keep claiming it.
    expect(resource.objectUrl).toBeNull();
  });
});

describe('disposeVideoResource', () => {
  it('releases the source regardless of ownership and drops it', () => {
    const host = fakeVideoHost();
    const source = videoSource();
    const resource = createVideoResource(source);

    disposeVideoResource(host.provider, resource);

    // The unconditional legacy path releases regardless of ownership.
    expect(host.released).toEqual([source]);
    expect(resource.element).toBeNull();
    expect(resource.ownsElement).toBe(false);
  });

  it('is a no-op on an already element-less resource', () => {
    const host = fakeVideoHost();
    const resource = createVideoResource();

    disposeVideoResource(host.provider, resource);

    expect(host.released).toEqual([]);
    expect(resource.element).toBeNull();
  });

  it('revokes an owned object URL and clears it', () => {
    const host = fakeVideoHost();
    const resource = createVideoResource(videoSource(), 'blob:owned');

    disposeVideoResource(host.provider, resource);

    expect(host.revoked).toEqual(['blob:owned']);
    expect(resource.objectUrl).toBeNull();
  });

  // Revoking is what makes the Blob GC-eligible, so it must survive a second disposal without
  // double-revoking a URL the resource no longer owns.
  it('does not revoke again when disposed twice', () => {
    const host = fakeVideoHost();
    const resource = createVideoResource(videoSource(), 'blob:owned');

    disposeVideoResource(host.provider, resource);
    disposeVideoResource(host.provider, resource);

    expect(host.revoked).toEqual(['blob:owned']);
  });

  // A resource built over a URL the caller manages must not have it revoked out from under them.
  it('revokes nothing when the resource owns no object URL', () => {
    const host = fakeVideoHost();

    disposeVideoResource(host.provider, createVideoResource(videoSource()));

    expect(host.revoked).toEqual([]);
  });

  // The host must let go of the source before the URL behind it is revoked, not after.
  it('revokes the object URL only after the host has released the element', () => {
    const host = fakeVideoHost();

    disposeVideoResource(host.provider, createVideoResource(videoSource(), 'blob:owned'));

    expect(host.order).toEqual(['release', 'revoke']);
  });
});

describe('getVideoResourceDuration', () => {
  it('returns 0 when there is no element', () => {
    expect(getVideoResourceDuration(fakeVideoHost().provider, createVideoResource())).toBe(0);
  });

  it('reads duration from the host', () => {
    const host = fakeVideoHost({ duration: 12.5 });
    expect(getVideoResourceDuration(host.provider, createVideoResource(videoSource()))).toBe(12.5);
  });

  it('returns 0 when the host cannot report a duration', () => {
    expect(getVideoResourceDuration(emptyVideoHost(), createVideoResource(videoSource()))).toBe(0);
  });
});

describe('getVideoResourceHeight', () => {
  it('returns 0 when there is no element', () => {
    expect(getVideoResourceHeight(fakeVideoHost().provider, createVideoResource())).toBe(0);
  });

  it('reads the decoded height from the host', () => {
    const host = fakeVideoHost({ height: 480 });
    expect(getVideoResourceHeight(host.provider, createVideoResource(videoSource()))).toBe(480);
  });

  it('returns 0 when the host cannot report dimensions', () => {
    expect(getVideoResourceHeight(emptyVideoHost(), createVideoResource(videoSource()))).toBe(0);
  });
});

describe('getVideoResourceWidth', () => {
  it('returns 0 when there is no element', () => {
    expect(getVideoResourceWidth(fakeVideoHost().provider, createVideoResource())).toBe(0);
  });

  it('reads the decoded width from the host', () => {
    const host = fakeVideoHost({ width: 640 });
    expect(getVideoResourceWidth(host.provider, createVideoResource(videoSource()))).toBe(640);
  });

  it('returns 0 when the host cannot report dimensions', () => {
    expect(getVideoResourceWidth(emptyVideoHost(), createVideoResource(videoSource()))).toBe(0);
  });
});

describe('hasVideoResourceElement', () => {
  it('is false without an element and true with one', () => {
    expect(hasVideoResourceElement(createVideoResource())).toBe(false);
    expect(hasVideoResourceElement(createVideoResource(videoSource()))).toBe(true);
  });
});

describe('initializeVideoResource', () => {
  it('is the construction initializer of createVideoResource', () => {
    expect(typeof initializeVideoResource).toBe('function');
  });
});

describe('isVideoResourceEmpty', () => {
  it('is true when there is no element', () => {
    expect(isVideoResourceEmpty(fakeVideoHost({ height: 480, width: 640 }).provider, createVideoResource())).toBe(true);
  });

  it('is true when the host reports no decoded dimensions', () => {
    const host = fakeVideoHost({ height: 0, width: 0 });
    expect(isVideoResourceEmpty(host.provider, createVideoResource(videoSource()))).toBe(true);
  });

  it('is false once the host reports dimensions', () => {
    const host = fakeVideoHost({ height: 480, width: 640 });
    expect(isVideoResourceEmpty(host.provider, createVideoResource(videoSource()))).toBe(false);
  });

  // One dimension at a time, because an `||` that tested only one of them would still pass a test
  // that zeroed both.
  it('is true when only one dimension is zero', () => {
    const wide = fakeVideoHost({ height: 0, width: 640 });
    const tall = fakeVideoHost({ height: 480, width: 0 });
    expect(isVideoResourceEmpty(wide.provider, createVideoResource(videoSource()))).toBe(true);
    expect(isVideoResourceEmpty(tall.provider, createVideoResource(videoSource()))).toBe(true);
  });

  it('is true when the host cannot report dimensions at all', () => {
    expect(isVideoResourceEmpty(emptyVideoHost(), createVideoResource(videoSource()))).toBe(true);
  });
});

describe('isVideoResourceReady', () => {
  it('is false when there is no element', () => {
    expect(isVideoResourceReady(fakeVideoHost({ ready: true }).provider, createVideoResource())).toBe(false);
  });

  it('is false while the host reports no decoded frame', () => {
    const host = fakeVideoHost({ ready: false });
    expect(isVideoResourceReady(host.provider, createVideoResource(videoSource()))).toBe(false);
  });

  it('is true once the host reports a decoded frame', () => {
    const host = fakeVideoHost({ ready: true });
    expect(isVideoResourceReady(host.provider, createVideoResource(videoSource()))).toBe(true);
  });

  it('is false when the host cannot answer readiness', () => {
    expect(isVideoResourceReady(emptyVideoHost(), createVideoResource(videoSource()))).toBe(false);
  });
});

interface FakeVideoHost {
  order: string[];
  provider: HostVideoCapability;
  released: HostImageSource[];
  revoked: string[];
}

// A host that answers every video capability and records what it was asked to release. `order` is
// shared with the URL spy in the ordering cases, so release-before-revoke is observable.
function fakeVideoHost(state?: Readonly<{ duration?: number; height?: number; ready?: boolean; width?: number }>) {
  const host: FakeVideoHost = {
    order: [],
    provider: null as unknown as HostVideoCapability,
    released: [],
    revoked: [],
  };
  host.provider = {
    canPlayType: () => true,
    getDuration: () => state?.duration ?? 0,
    getHeight: () => state?.height ?? 0,
    getWidth: () => state?.width ?? 0,
    isReady: () => state?.ready ?? false,
    releaseElement: (element) => {
      host.order.push('release');
      host.released.push(element);
    },
    revokeObjectUrl: (url) => {
      host.order.push('revoke');
      host.revoked.push(url);
    },
  };
  return host;
}

// A host with a video slot that carries none of the optional capabilities — the shape a non-browser
// host takes. Every query must fall to its documented sentinel rather than throwing.
function emptyVideoHost(): HostVideoCapability {
  return { canPlayType: () => false };
}

function videoSource(): HostImageSource {
  return {} as HostImageSource;
}
