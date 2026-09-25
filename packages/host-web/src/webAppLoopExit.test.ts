import { webHostAppLoopExit } from './webAppLoopExit.ts';
import { webHost } from './webHost.ts';

describe('webHostAppLoopExit', () => {
  it('owns the browser beforeunload subscription and removes the exact listener', () => {
    const listener = vi.fn();

    const release = webHostAppLoopExit.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    release();
    window.dispatchEvent(new Event('beforeunload'));

    expect(listener).toHaveBeenCalledOnce();
  });

  it('returns an independent release for each subscription', () => {
    const listener = vi.fn();

    const releaseFirst = webHostAppLoopExit.subscribe(listener);
    const releaseSecond = webHostAppLoopExit.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    releaseFirst();
    window.dispatchEvent(new Event('beforeunload'));
    releaseSecond();
    window.dispatchEvent(new Event('beforeunload'));

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('occupies the explicit web host application-exit slot', () => {
    expect(webHost.app.exit).toBe(webHostAppLoopExit);
  });
});
