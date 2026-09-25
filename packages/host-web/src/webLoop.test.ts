import { webHost } from './webHost.ts';
import { webHostLoop } from './webLoop.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('webHostLoop', () => {
  it('delegates frame scheduling and cancellation to the browser', () => {
    const callback = vi.fn();
    const request = vi.fn().mockReturnValue(42);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const handle = webHostLoop.requestFrame(callback);
    webHostLoop.cancelFrame(handle);

    expect(request).toHaveBeenCalledWith(callback);
    expect(handle).toBe(42);
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it('reads the browser clock', () => {
    vi.spyOn(performance, 'now').mockReturnValue(12.5);
    expect(webHostLoop.now()).toBe(12.5);
  });

  it('occupies the explicit web host scheduling slot', () => {
    expect(webHost.app.loop).toBe(webHostLoop);
  });
});
