import type { TauriApi, TauriTrayIconEvent, TauriTrayIconOptions } from './tauriModule';
import { createTauriTrayBackend } from './tauriTray';

function fakeTauri() {
  const state = {
    created: 0,
    closed: 0,
    lastTitle: '' as string | null,
    lastIcon: '' as string | null,
    menusSet: 0,
    // The action callback the most recently created tray registered.
    action: null as ((event: Readonly<TauriTrayIconEvent>) => void) | null,
  };
  const tauri = {
    tray: {
      TrayIcon: {
        async new(options?: TauriTrayIconOptions) {
          state.created++;
          state.action = options?.action ?? null;
          return {
            async setIcon(icon: string | null) {
              state.lastIcon = icon;
            },
            async setTitle(title: string | null) {
              state.lastTitle = title;
            },
            async setTooltip() {},
            async setMenu() {
              state.menusSet++;
            },
            async close() {
              state.closed++;
            },
          };
        },
      },
    },
    menu: {
      Menu: {
        async new() {
          return { async setAsAppMenu() {}, async popup() {} };
        },
      },
      MenuItem: {
        async new(o?: { id?: string }) {
          return { id: o?.id ?? '' };
        },
      },
      Submenu: {
        async new() {
          return { id: 's' };
        },
      },
      PredefinedMenuItem: {
        async new() {
          return { id: 'sep' };
        },
      },
    },
  } as unknown as TauriApi;
  return { tauri, state };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

describe('createTauriTrayBackend', () => {
  it('allocates a numeric id synchronously and builds the tray asynchronously', async () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriTrayBackend(tauri);
    const id = backend.create({ title: 'Flight', tooltip: 'tip' });
    expect(typeof id).toBe('number');
    expect(backend.getTitle(id)).toBe('Flight');
    expect(backend.getTooltip(id)).toBe('tip');
    expect(backend.listIds()).toContain(id);
    await flush();
    expect(state.created).toBe(1);
  });

  it('forwards clicks as tray events, discriminating left/right', async () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriTrayBackend(tauri);
    const events: string[] = [];
    backend.subscribe((event) => events.push(event.type));
    const id = backend.create({});
    await flush();
    state.action!({ type: 'Click', button: 'Left' });
    state.action!({ type: 'Click', button: 'Right' });
    state.action!({ type: 'DoubleClick' });
    state.action!({ type: 'Enter' });
    expect(events).toEqual(['click', 'rightClick', 'doubleClick']);
    expect(id).toBeGreaterThanOrEqual(0);
  });

  it('applies title/icon changes and a context menu to the resolved handle', async () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriTrayBackend(tauri);
    const id = backend.create({});
    await flush();
    backend.setTitle(id, 'New');
    backend.setIcon(id, '/icon.png');
    backend.setContextMenu(id, [{ id: 'a', label: 'A' }, { type: 'separator' }]);
    await flush();
    expect(state.lastTitle).toBe('New');
    expect(state.lastIcon).toBe('/icon.png');
    expect(state.menusSet).toBe(1);
    expect(backend.getTitle(id)).toBe('New');
  });

  it('destroys the tray and reports sentinels for unsupported surface', async () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriTrayBackend(tauri);
    const id = backend.create({});
    await flush();
    expect(backend.getBounds(id)).toBeNull();
    expect(backend.getCapabilities().balloon).toBe(false);
    backend.destroy(id);
    await flush();
    expect(state.closed).toBe(1);
    expect(backend.isDestroyed(id)).toBe(true);
  });
});
