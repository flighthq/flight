import type { TauriApi } from '@flighthq/types';

import { createTauriShellBackend } from './tauriShell';

function fakeTauri(reject = false) {
  const calls: { openUrl: string[]; openPath: string[]; reveal: string[] } = {
    openUrl: [],
    openPath: [],
    reveal: [],
  };
  const guard = async () => {
    if (reject) throw new Error('boom');
  };
  const tauri = {
    opener: {
      async openUrl(url: string) {
        calls.openUrl.push(url);
        await guard();
      },
      async openPath(path: string) {
        calls.openPath.push(path);
        await guard();
      },
      async revealItemInDir(path: string) {
        calls.reveal.push(path);
        await guard();
      },
    },
  } as unknown as TauriApi;
  return { tauri, calls };
}

describe('createTauriShellBackend', () => {
  it('opens URLs and paths through the opener plugin', async () => {
    const { tauri, calls } = fakeTauri();
    const backend = createTauriShellBackend(tauri);
    expect(await backend.openExternal('https://x.test')).toBe(true);
    expect(await backend.openPath('/tmp/a')).toBe(true);
    expect(await backend.showItemInFolder('/tmp/a')).toBe(true);
    expect(calls.openUrl).toEqual(['https://x.test']);
    expect(calls.openPath).toEqual(['/tmp/a']);
    expect(calls.reveal).toEqual(['/tmp/a']);
  });

  it('reports the error message from openPathResult', async () => {
    expect(await createTauriShellBackend(fakeTauri().tauri).openPathResult('/tmp/a')).toBe('');
    expect(await createTauriShellBackend(fakeTauri(true).tauri).openPathResult('/tmp/a')).toBe('boom');
  });

  it('resolves false when the opener rejects', async () => {
    const backend = createTauriShellBackend(fakeTauri(true).tauri);
    expect(await backend.openExternal('https://x.test')).toBe(false);
    expect(await backend.showItemInFolder('/tmp/a')).toBe(false);
  });

  it('reports sentinels for trash, shortcut links, and beep', async () => {
    const backend = createTauriShellBackend(fakeTauri().tauri);
    expect(await backend.moveToTrash('/tmp/a')).toBe(false);
    expect(await backend.moveItemsToTrash(['/a', '/b'])).toEqual([false, false]);
    expect(await backend.readShortcutLink('/a.lnk')).toBeNull();
    expect(await backend.writeShortcutLink('/a.lnk', { target: '/t' })).toBe(false);
    expect(() => backend.beep()).not.toThrow();
  });
});
