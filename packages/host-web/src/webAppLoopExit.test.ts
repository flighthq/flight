import { webHostAppLoopExit } from './webAppLoopExit';
import { webHost } from './webHost';

describe('webHostAppLoopExit', () => {
  it('owns the browser beforeunload subscription and removes the exact listener', () => {
    const listener = vi.fn();

    webHostAppLoopExit.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    webHostAppLoopExit.unsubscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));

    expect(listener).toHaveBeenCalledOnce();
  });

  it('replaces a repeated subscription without duplicating delivery', () => {
    const listener = vi.fn();

    webHostAppLoopExit.subscribe(listener);
    webHostAppLoopExit.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    webHostAppLoopExit.unsubscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('occupies the explicit web host application-exit slot', () => {
    expect(webHost.app.exit).toBe(webHostAppLoopExit);
  });
});
