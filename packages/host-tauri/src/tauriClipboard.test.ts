import type { TauriApi } from '@flighthq/types';

import { createTauriClipboardBackend } from './tauriClipboard';

function fakeTauri() {
  const store = { text: '' };
  const calls: string[] = [];
  const tauri = {
    clipboard: {
      async readText() {
        calls.push('readText');
        return store.text;
      },
      async writeText(text: string) {
        calls.push('writeText');
        store.text = text;
      },
      async clear() {
        calls.push('clear');
        store.text = '';
      },
    },
  } as unknown as TauriApi;
  return { tauri, store, calls };
}

describe('createTauriClipboardBackend', () => {
  it('round-trips text through the Tauri clipboard', async () => {
    const { tauri, calls } = fakeTauri();
    const backend = createTauriClipboardBackend(tauri);
    expect(await backend.writeText('hi')).toBe(true);
    expect(await backend.readText()).toBe('hi');
    expect(await backend.hasText()).toBe(true);
    expect(calls).toContain('writeText');
    expect(calls).toContain('readText');
  });

  it('clears via the Tauri clipboard', async () => {
    const { tauri, calls } = fakeTauri();
    const backend = createTauriClipboardBackend(tauri);
    await backend.writeText('x');
    expect(await backend.clear()).toBe(true);
    expect(calls).toContain('clear');
    expect(await backend.hasText()).toBe(false);
  });

  it('reports sentinels for unsupported flavors', async () => {
    const backend = createTauriClipboardBackend(fakeTauri().tauri);
    expect(await backend.readHtml()).toBe('');
    expect(await backend.writeHtml('<b/>')).toBe(false);
    expect(await backend.readImage()).toBe('');
    expect(await backend.readBookmark()).toBeNull();
    expect(await backend.getFormats()).toEqual([]);
    expect(await backend.readFiles()).toEqual([]);
    expect(backend.getChangeCount()).toBe(-1);
  });

  it('resolves sentinels when the clipboard read throws', async () => {
    const tauri = {
      clipboard: {
        async readText() {
          throw new Error('denied');
        },
      },
    } as unknown as TauriApi;
    const backend = createTauriClipboardBackend(tauri);
    expect(await backend.readText()).toBe('');
    expect(await backend.hasText()).toBe(false);
  });
});
