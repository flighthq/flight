import { webHost } from './webHost';
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('webApplicationVisibilityBackend', () => {
  it('queries the current document visibility', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    expect(webApplicationVisibilityBackend.isVisible()).toBe(true);

    hidden.mockReturnValue(true);
    expect(webApplicationVisibilityBackend.isVisible()).toBe(false);
  });

  it('occupies the web host visibility query slot separately from scheduling', () => {
    expect(webHost.app.visibility).toBe(webApplicationVisibilityBackend);
    expect(webHost.app.visibility).not.toBe(webHost.app.loop);
  });
});

describe('webLoopBackend', () => {
  it('delegates frame scheduling and cancellation to the browser', () => {
    const callback = vi.fn();
    const request = vi.fn().mockReturnValue(42);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const handle = webLoopBackend.requestFrame(callback);
    webLoopBackend.cancelFrame(handle);

    expect(request).toHaveBeenCalledWith(callback);
    expect(handle).toBe(42);
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it('reads the browser clock', () => {
    vi.spyOn(performance, 'now').mockReturnValue(12.5);
    expect(webLoopBackend.now()).toBe(12.5);
  });

  it('occupies the explicit web host scheduling slot', () => {
    expect(webHost.app.loop).toBe(webLoopBackend);
  });
});
