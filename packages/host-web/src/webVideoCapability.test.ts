import { EntityRuntimeKey } from '@flighthq/types/contract';
import { canPlayVideoType } from '@flighthq/video/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  createWebVideoCapabilityBackend,
  initializeWebVideoCapabilityBackend,
  webHostVideo,
} from './webVideoCapability';

describe('createWebVideoCapabilityBackend', () => {
  it('constructs a backend with canPlayType and createVideoElement', () => {
    const backend = createWebVideoCapabilityBackend();
    expect(backend.canPlayType).toBeTypeOf('function');
    expect(backend.createVideoElement).toBeTypeOf('function');
  });

  it('constructs an identity-bearing provider Entity', () => {
    expect(EntityRuntimeKey in createWebVideoCapabilityBackend()).toBe(true);
  });

  it('exposes all video provider operations', () => {
    const backend = createWebVideoCapabilityBackend();
    expect(backend.attachStream).toBeTypeOf('function');
    expect(backend.createObjectUrl).toBeTypeOf('function');
    expect(backend.getDuration).toBeTypeOf('function');
    expect(backend.getHeight).toBeTypeOf('function');
    expect(backend.getWidth).toBeTypeOf('function');
    expect(backend.isReady).toBeTypeOf('function');
    expect(backend.loadUrl).toBeTypeOf('function');
    expect(backend.releaseElement).toBeTypeOf('function');
    expect(backend.revokeObjectUrl).toBeTypeOf('function');
  });

  it('returns distinct instances on each call', () => {
    expect(createWebVideoCapabilityBackend()).not.toBe(createWebVideoCapabilityBackend());
  });

  it.each([
    ['', false],
    ['maybe', true],
    ['probably', true],
    ['invalid', false],
  ] as const)('normalizes the browser result %j to %j', (result, expected) => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue(result as CanPlayTypeResult);
    const backend = createWebVideoCapabilityBackend();
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(expected);
    vi.restoreAllMocks();
  });

  it('normalizes DOM exceptions to false', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = createWebVideoCapabilityBackend();
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(false);
    vi.restoreAllMocks();
  });

  it('createVideoElement returns a video element', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!();
    expect(element).not.toBeNull();
  });

  it('getDuration returns 0 for a fresh element', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!();
    expect(backend.getDuration!(element!)).toBe(0);
  });

  it('getWidth returns 0 for a fresh element', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!();
    expect(backend.getWidth!(element!)).toBe(0);
  });

  it('getHeight returns 0 for a fresh element', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!();
    expect(backend.getHeight!(element!)).toBe(0);
  });

  it('isReady returns false for a fresh element', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!();
    expect(backend.isReady!(element!)).toBe(false);
  });

  it('releaseElement removes source and reloads', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!() as HTMLVideoElement;
    const loadSpy = vi.spyOn(element, 'load').mockImplementation(() => {});
    backend.releaseElement!(element);
    expect(element.getAttribute('src')).toBeNull();
    expect(loadSpy).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('attachStream returns an element with srcObject set', () => {
    const backend = createWebVideoCapabilityBackend();
    const mockStream = {} as MediaStream;
    const element = backend.attachStream!(mockStream) as HTMLVideoElement;
    expect(element).not.toBeNull();
    expect(element.srcObject).toBe(mockStream);
  });

  it('attachStream returns null when DOM is unavailable', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = createWebVideoCapabilityBackend();
    expect(backend.attachStream!({} as MediaStream)).toBeNull();
    vi.restoreAllMocks();
  });

  it('createObjectUrl and revokeObjectUrl manage blob URLs', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const backend = createWebVideoCapabilityBackend();
    const blob = new Blob(['test'], { type: 'video/mp4' });
    const url = backend.createObjectUrl!(blob);
    expect(url).toBe('blob:test');
    expect(createSpy).toHaveBeenCalledWith(blob);
    backend.revokeObjectUrl!(url);
    expect(revokeSpy).toHaveBeenCalledWith('blob:test');
    vi.restoreAllMocks();
  });

  it('loadUrl rejects immediately when signal is already aborted', async () => {
    const backend = createWebVideoCapabilityBackend();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(backend.loadUrl!('test.mp4', undefined, controller.signal)).rejects.toThrow('cancelled');
  });

  it('loadUrl rejects when DOM is unavailable', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = createWebVideoCapabilityBackend();
    await expect(backend.loadUrl!('test.mp4')).rejects.toThrow('No video element available');
    vi.restoreAllMocks();
  });
});

describe('initializeWebVideoCapabilityBackend', () => {
  it('is the construction initializer of createWebVideoCapabilityBackend', () => {
    expect(typeof initializeWebVideoCapabilityBackend).toBe('function');
  });
});

describe('webHostVideo', () => {
  it('is an Entity with canPlayType and createVideoElement', () => {
    expect(EntityRuntimeKey in webHostVideo).toBe(true);
    expect(webHostVideo.canPlayType).toBeTypeOf('function');
    expect(webHostVideo.createVideoElement).toBeTypeOf('function');
  });

  it('is a stable singleton', () => {
    expect(webHostVideo).toBe(webHostVideo);
  });

  it('exposes all video provider operations', () => {
    expect(webHostVideo.getDuration).toBeTypeOf('function');
    expect(webHostVideo.getHeight).toBeTypeOf('function');
    expect(webHostVideo.getWidth).toBeTypeOf('function');
    expect(webHostVideo.isReady).toBeTypeOf('function');
    expect(webHostVideo.loadUrl).toBeTypeOf('function');
    expect(webHostVideo.releaseElement).toBeTypeOf('function');
    expect(webHostVideo.attachStream).toBeTypeOf('function');
    expect(webHostVideo.createObjectUrl).toBeTypeOf('function');
    expect(webHostVideo.revokeObjectUrl).toBeTypeOf('function');
  });
});
