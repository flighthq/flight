import type { TauriApi, TauriShortcutEvent } from './tauriModule';
import { createTauriShortcutBackend } from './tauriShortcut';

function fakeTauri() {
  const handlers = new Map<string, (event: Readonly<TauriShortcutEvent>) => void>();
  const calls: { register: string[]; unregister: string[]; unregisterAll: number } = {
    register: [],
    unregister: [],
    unregisterAll: 0,
  };
  const tauri = {
    globalShortcut: {
      async register(shortcut: string, handler: (event: Readonly<TauriShortcutEvent>) => void) {
        calls.register.push(shortcut);
        handlers.set(shortcut, handler);
      },
      async unregister(shortcut: string) {
        calls.unregister.push(shortcut);
        handlers.delete(shortcut);
      },
      async unregisterAll() {
        calls.unregisterAll++;
        handlers.clear();
      },
      async isRegistered(shortcut: string) {
        return handlers.has(shortcut);
      },
    },
  } as unknown as TauriApi;
  return { tauri, handlers, calls };
}

describe('createTauriShortcutBackend', () => {
  it('optimistically mirrors registrations synchronously', () => {
    const { tauri, calls } = fakeTauri();
    const backend = createTauriShortcutBackend(tauri);
    expect(backend.register('CmdOrCtrl+K', () => {})).toBe(true);
    expect(backend.isRegistered('CmdOrCtrl+K')).toBe(true);
    expect(backend.getRegistered()).toEqual(['CmdOrCtrl+K']);
    expect(calls.register).toEqual(['CmdOrCtrl+K']);
  });

  it('delivers a ShortcutEvent only on the Pressed state', async () => {
    const { tauri, handlers } = fakeTauri();
    const backend = createTauriShortcutBackend(tauri);
    let fired = 0;
    let seen = '';
    backend.register('Alt+P', (event) => {
      fired++;
      seen = event.accelerator;
    });
    await Promise.resolve();
    const handler = handlers.get('Alt+P')!;
    handler({ shortcut: 'Alt+P', state: 'Released' });
    handler({ shortcut: 'Alt+P', state: 'Pressed' });
    expect(fired).toBe(1);
    expect(seen).toBe('Alt+P');
  });

  it('unregisters individually and en masse', () => {
    const { tauri, calls } = fakeTauri();
    const backend = createTauriShortcutBackend(tauri);
    backend.register('A', () => {});
    backend.register('B', () => {});
    expect(backend.unregister('A')).toBe(true);
    expect(backend.isRegistered('A')).toBe(false);
    backend.unregisterAll();
    expect(backend.getRegistered()).toEqual([]);
    expect(calls.unregisterAll).toBe(1);
  });

  it('reports the enable-toggle sentinels', () => {
    const backend = createTauriShortcutBackend(fakeTauri().tauri);
    expect(backend.setEnabled('A', true)).toBe(false);
    expect(() => backend.setAllEnabled(true)).not.toThrow();
  });
});
