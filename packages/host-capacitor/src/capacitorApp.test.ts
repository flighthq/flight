import { createCapacitorAppBackend } from './capacitorApp';
import type { CapacitorApi } from './capacitorModule';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeCapacitor() {
  const calls: string[] = [];
  const listeners = new Map<string, (payload: unknown) => void>();
  const capacitor = {
    app: {
      async getInfo() {
        return { name: 'FlightApp', id: 'com.flight.app', build: '42', version: '2.3.4' };
      },
      async exitApp() {
        calls.push('exitApp');
      },
      async minimizeApp() {
        calls.push('minimizeApp');
      },
      async addListener(eventName: string, listener: (payload: unknown) => void) {
        listeners.set(eventName, listener);
        return {
          async remove() {
            calls.push(`remove:${eventName}`);
          },
        };
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, calls, listeners };
}

describe('createCapacitorAppBackend', () => {
  it('serves name and version from the prefetch cache once it resolves', async () => {
    const backend = createCapacitorAppBackend(fakeCapacitor().capacitor);
    // The sync getters read '' until the construction-time prefetch settles.
    expect(backend.getName()).toBe('');
    await flush();
    expect(backend.getName()).toBe('FlightApp');
    expect(backend.getVersion()).toBe('2.3.4');
  });

  it('fires the process/app control methods', () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorAppBackend(capacitor);
    backend.quit();
    expect(backend.hideApp()).toBe(true);
    expect(calls).toContain('exitApp');
    expect(calls).toContain('minimizeApp');
  });

  it('routes activate and open-file through app listeners', async () => {
    const { capacitor, listeners } = fakeCapacitor();
    const backend = createCapacitorAppBackend(capacitor);
    let activated = 0;
    let openedUrl = '';
    backend.subscribeActivate(() => activated++);
    backend.subscribeOpenFile((url) => (openedUrl = url));
    await flush();
    listeners.get('appStateChange')?.({ isActive: false });
    expect(activated).toBe(0);
    listeners.get('appStateChange')?.({ isActive: true });
    expect(activated).toBe(1);
    listeners.get('appUrlOpen')?.({ url: 'flight://open' });
    expect(openedUrl).toBe('flight://open');
  });

  it('reports sentinels for the desktop-only surface', () => {
    const backend = createCapacitorAppBackend(fakeCapacitor().capacitor);
    expect(backend.bounceDock()).toBe(-1);
    expect(backend.setBadgeCount(3)).toBe(false);
    expect(backend.setName('X')).toBe(false);
    expect(backend.showApp()).toBe(false);
    expect(backend.getLocale()).toBe('');
    expect(backend.getCommandLine()).toEqual([]);
    expect(typeof backend.subscribeReady(() => {})).toBe('function');
  });
});
