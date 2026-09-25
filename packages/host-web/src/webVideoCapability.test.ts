import { canPlayVideoType } from '@flighthq/video/contract';
import { describe, expect, it, vi } from 'vitest';

import { webHostVideo } from './webVideoCapability.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webHostVideo', () => {
  it('constructs a backend with canPlayType and createVideoElement', () => {
    const backend = webHostVideo;
    expect(backend.canPlayType).toBeTypeOf('function');
    expect(backend.createVideoElement).toBeTypeOf('function');
  });

  it('exposes all video provider operations', () => {
    const backend = webHostVideo;
    expect(backend.addEndedListener).toBeTypeOf('function');
    expect(backend.attachStream).toBeTypeOf('function');
    expect(backend.createObjectUrl).toBeTypeOf('function');
    expect(backend.getCurrentTime).toBeTypeOf('function');
    expect(backend.getDuration).toBeTypeOf('function');
    expect(backend.getHeight).toBeTypeOf('function');
    expect(backend.getLoop).toBeTypeOf('function');
    expect(backend.getMuted).toBeTypeOf('function');
    expect(backend.getPlaybackRate).toBeTypeOf('function');
    expect(backend.getVolume).toBeTypeOf('function');
    expect(backend.getWidth).toBeTypeOf('function');
    expect(backend.isReady).toBeTypeOf('function');
    expect(backend.loadUrl).toBeTypeOf('function');
    expect(backend.pause).toBeTypeOf('function');
    expect(backend.play).toBeTypeOf('function');
    expect(backend.releaseElement).toBeTypeOf('function');
    expect(backend.removeEndedListener).toBeTypeOf('function');
    expect(backend.revokeObjectUrl).toBeTypeOf('function');
    expect(backend.setCurrentTime).toBeTypeOf('function');
    expect(backend.setLoop).toBeTypeOf('function');
    expect(backend.setMuted).toBeTypeOf('function');
    expect(backend.setPlaybackRate).toBeTypeOf('function');
    expect(backend.setVolume).toBeTypeOf('function');
  });

  it.each([
    ['', false],
    ['maybe', true],
    ['probably', true],
    ['invalid', false],
  ] as const)('normalizes the browser result %j to %j', (result, expected) => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue(result as CanPlayTypeResult);
    const backend = webHostVideo;
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(expected);
    vi.restoreAllMocks();
  });

  it('normalizes DOM exceptions to false', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = webHostVideo;
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(false);
    vi.restoreAllMocks();
  });

  it('createVideoElement returns a video element', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!();
    expect(element).not.toBeNull();
  });

  it('getDuration returns 0 for a fresh element', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!();
    expect(backend.getDuration!(element!)).toBe(0);
  });

  it('getWidth returns 0 for a fresh element', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!();
    expect(backend.getWidth!(element!)).toBe(0);
  });

  it('getHeight returns 0 for a fresh element', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!();
    expect(backend.getHeight!(element!)).toBe(0);
  });

  it('isReady returns false for a fresh element', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!();
    expect(backend.isReady!(element!)).toBe(false);
  });

  it('releaseElement removes source and reloads', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    const loadSpy = vi.spyOn(element, 'load').mockImplementation(() => {});
    backend.releaseElement!(element);
    expect(element.getAttribute('src')).toBeNull();
    expect(loadSpy).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('attachStream returns an element with srcObject set', () => {
    const backend = webHostVideo;
    const mockStream = {} as MediaStream;
    const element = backend.attachStream!(mockStream) as HTMLVideoElement;
    expect(element).not.toBeNull();
    expect(element.srcObject).toBe(mockStream);
  });

  it('attachStream returns null when DOM is unavailable', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = webHostVideo;
    expect(backend.attachStream!({} as MediaStream)).toBeNull();
    vi.restoreAllMocks();
  });

  it('createObjectUrl and revokeObjectUrl manage blob URLs', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const backend = webHostVideo;
    const blob = new Blob(['test'], { type: 'video/mp4' });
    const url = backend.createObjectUrl!(blob);
    expect(url).toBe('blob:test');
    expect(createSpy).toHaveBeenCalledWith(blob);
    backend.revokeObjectUrl!(url);
    expect(revokeSpy).toHaveBeenCalledWith('blob:test');
    vi.restoreAllMocks();
  });

  it('getCurrentTime returns the element currentTime', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    element.currentTime = 5.5;
    expect(backend.getCurrentTime!(element)).toBe(5.5);
  });

  it('setCurrentTime sets the element currentTime', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    backend.setCurrentTime!(element, 3.0);
    expect(element.currentTime).toBe(3.0);
  });

  it('getVolume returns the element volume', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    expect(backend.getVolume!(element)).toBe(1);
  });

  it('setVolume sets the element volume', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    backend.setVolume!(element, 0.5);
    expect(element.volume).toBe(0.5);
  });

  it('getMuted returns the element muted state', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    expect(backend.getMuted!(element)).toBe(false);
  });

  it('setMuted sets the element muted state', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    backend.setMuted!(element, true);
    expect(element.muted).toBe(true);
  });

  it('getPlaybackRate returns the element playbackRate', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    expect(backend.getPlaybackRate!(element)).toBe(1);
  });

  it('setPlaybackRate sets the element playbackRate', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    backend.setPlaybackRate!(element, 2.0);
    expect(element.playbackRate).toBe(2.0);
  });

  it('getLoop returns the element loop state', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    expect(backend.getLoop!(element)).toBe(false);
  });

  it('setLoop sets the element loop state', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    backend.setLoop!(element, true);
    expect(element.loop).toBe(true);
  });

  it('pause calls element.pause', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    const pauseSpy = vi.spyOn(element, 'pause');
    backend.pause!(element);
    expect(pauseSpy).toHaveBeenCalledOnce();
  });

  it('play calls element.play', async () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    vi.spyOn(element, 'play').mockResolvedValue();
    await expect(backend.play!(element)).resolves.toBeUndefined();
  });

  it('addEndedListener and removeEndedListener manage ended event listeners', () => {
    const backend = webHostVideo;
    const element = backend.createVideoElement!() as HTMLVideoElement;
    const addSpy = vi.spyOn(element, 'addEventListener');
    const removeSpy = vi.spyOn(element, 'removeEventListener');
    const listener = vi.fn();
    backend.addEndedListener!(element, listener);
    expect(addSpy).toHaveBeenCalledWith('ended', listener);
    backend.removeEndedListener!(element, listener);
    expect(removeSpy).toHaveBeenCalledWith('ended', listener);
  });

  it('loadUrl rejects immediately when signal is already aborted', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    const backend = webHostVideo;
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(backend.loadUrl!('test.mp4', undefined, controller.signal)).rejects.toThrow('cancelled');
    expect(createElement).not.toHaveBeenCalled();
  });

  it('loadUrl rejects when DOM is unavailable', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = webHostVideo;
    await expect(backend.loadUrl!('test.mp4')).rejects.toThrow('No video element available');
    vi.restoreAllMocks();
  });

  it('loadUrl applies defaults and releases its listeners after the default readiness event', async () => {
    const element = document.createElement('video');
    const removeEventListener = vi.spyOn(element, 'removeEventListener');
    vi.spyOn(document, 'createElement').mockReturnValue(element as never);
    const backend = webHostVideo;

    const promise = backend.loadUrl!('test.mp4');
    expect(element.preload).toBe('auto');
    element.dispatchEvent(new Event('canplay'));

    await expect(promise).resolves.toBe(element);
    expect(removeEventListener).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('loadUrl applies options before resolving at the requested readiness event', async () => {
    const element = document.createElement('video');
    vi.spyOn(document, 'createElement').mockReturnValue(element as never);
    const backend = webHostVideo;

    const promise = backend.loadUrl!('test.mp4', {
      crossOrigin: 'anonymous',
      muted: true,
      playsInline: true,
      preload: 'metadata',
      readiness: 'metadata',
    });

    expect(element.crossOrigin).toBe('anonymous');
    expect(element.muted).toBe(true);
    expect(element.playsInline).toBe(true);
    expect(element.preload).toBe('metadata');
    element.dispatchEvent(new Event('loadedmetadata'));
    await expect(promise).resolves.toBe(element);
  });

  it('loadUrl supports canplaythrough readiness', async () => {
    const element = document.createElement('video');
    vi.spyOn(document, 'createElement').mockReturnValue(element as never);
    const backend = webHostVideo;

    const promise = backend.loadUrl!('test.mp4', { readiness: 'canplaythrough' });
    element.dispatchEvent(new Event('canplaythrough'));

    await expect(promise).resolves.toBe(element);
  });

  it('loadUrl releases the element and paired listeners after a media error', async () => {
    const element = document.createElement('video');
    const load = vi.spyOn(element, 'load').mockImplementation(() => {});
    const removeEventListener = vi.spyOn(element, 'removeEventListener');
    vi.spyOn(document, 'createElement').mockReturnValue(element as never);
    const backend = webHostVideo;

    const promise = backend.loadUrl!('bad.mp4');
    element.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow('Failed to load video: bad.mp4');
    expect(element.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('loadUrl releases the element and every paired listener after abort', async () => {
    const element = document.createElement('video');
    const load = vi.spyOn(element, 'load').mockImplementation(() => {});
    const removeEventListener = vi.spyOn(element, 'removeEventListener');
    vi.spyOn(document, 'createElement').mockReturnValue(element as never);
    const backend = webHostVideo;
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');

    const promise = backend.loadUrl!('test.mp4', undefined, controller.signal);
    controller.abort(new Error('cancelled'));

    await expect(promise).rejects.toThrow('cancelled');
    expect(element.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
