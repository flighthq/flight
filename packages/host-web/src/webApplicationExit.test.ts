import { webHostApplicationExit } from './webApplicationExit';
import { webHost } from './webHost';

describe('webHostApplicationExit', () => {
  it('owns the browser beforeunload subscription and removes the exact listener', () => {
    const listener = vi.fn();

    webHostApplicationExit.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    webHostApplicationExit.unsubscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));

    expect(listener).toHaveBeenCalledOnce();
  });

  it('replaces a repeated subscription without duplicating delivery', () => {
    const listener = vi.fn();

    webHostApplicationExit.subscribe(listener);
    webHostApplicationExit.subscribe(listener);
    window.dispatchEvent(new Event('beforeunload'));
    webHostApplicationExit.unsubscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('occupies the explicit web host application-exit slot', () => {
    expect(webHost.app.exit).toBe(webHostApplicationExit);
  });
});
