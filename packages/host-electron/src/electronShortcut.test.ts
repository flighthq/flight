import type { ElectronApi } from '@flighthq/types';

import { createElectronShortcutBackend } from './electronShortcut';

function fakeElectron(): { electron: ElectronApi; registered: Map<string, () => void> } {
  const registered = new Map<string, () => void>();
  const electron = {
    globalShortcut: {
      register: (accelerator: string, callback: () => void) => {
        registered.set(accelerator, callback);
        return true;
      },
      unregister: (accelerator: string) => {
        registered.delete(accelerator);
      },
      unregisterAll: () => {
        registered.clear();
      },
      isRegistered: (accelerator: string) => registered.has(accelerator),
    },
  } as unknown as ElectronApi;
  return { electron, registered };
}

describe('createElectronShortcutBackend', () => {
  it('registers and reports a shortcut, invoking its listener', () => {
    const fake = fakeElectron();
    const backend = createElectronShortcutBackend(fake.electron);
    let fired = 0;
    expect(
      backend.register('CommandOrControl+X', () => {
        fired++;
      }),
    ).toBe(true);
    expect(backend.isRegistered('CommandOrControl+X')).toBe(true);
    fake.registered.get('CommandOrControl+X')?.();
    expect(fired).toBe(1);
  });

  it('unregisters one shortcut, returning true', () => {
    const fake = fakeElectron();
    const backend = createElectronShortcutBackend(fake.electron);
    backend.register('Ctrl+A', () => {});
    expect(backend.unregister('Ctrl+A')).toBe(true);
    expect(backend.isRegistered('Ctrl+A')).toBe(false);
  });

  it('unregisters all shortcuts', () => {
    const fake = fakeElectron();
    const backend = createElectronShortcutBackend(fake.electron);
    backend.register('Ctrl+A', () => {});
    backend.register('Ctrl+B', () => {});
    backend.unregisterAll();
    expect(backend.isRegistered('Ctrl+A')).toBe(false);
    expect(backend.isRegistered('Ctrl+B')).toBe(false);
  });
});
