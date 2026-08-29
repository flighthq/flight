import { webApplicationExitBackend } from './webApplicationExit';
import { webHost } from './webHost';

describe('webApplicationExitBackend', () => {
  it('owns the browser beforeunload subscription and removes the exact listener', () => {
    const listener = vi.fn();

    webApplicationExitBackend.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    webApplicationExitBackend.unsubscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));

    expect(listener).toHaveBeenCalledOnce();
  });

  it('replaces a repeated subscription without duplicating delivery', () => {
    const listener = vi.fn();

    webApplicationExitBackend.subscribe(listener);
    webApplicationExitBackend.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    webApplicationExitBackend.unsubscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('occupies the explicit web host application-exit slot', () => {
    expect(webHost.app.exit).toBe(webApplicationExitBackend);
  });
});
