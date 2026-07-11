import { createCapacitorClipboardBackend } from './capacitorClipboard';
import type { CapacitorApi } from './capacitorModule';

function fakeCapacitor() {
  const store = { value: '', type: 'text/plain' };
  const calls: string[] = [];
  const capacitor = {
    clipboard: {
      async read() {
        calls.push('read');
        return { value: store.value, type: store.type };
      },
      async write(options: { string?: string; image?: string }) {
        calls.push('write');
        if (options.image !== undefined) {
          store.value = options.image;
          store.type = 'image/png';
        } else {
          store.value = options.string ?? '';
          store.type = 'text/plain';
        }
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, store, calls };
}

describe('createCapacitorClipboardBackend', () => {
  it('round-trips text through the Capacitor clipboard', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorClipboardBackend(capacitor);
    expect(await backend.writeText('hi')).toBe(true);
    expect(await backend.readText()).toBe('hi');
    expect(await backend.hasText()).toBe(true);
    expect(calls).toContain('write');
    expect(calls).toContain('read');
  });

  it('round-trips a data-URL image', async () => {
    const backend = createCapacitorClipboardBackend(fakeCapacitor().capacitor);
    expect(await backend.writeImage('data:image/png;base64,AAAA')).toBe(true);
    expect(await backend.readImage()).toBe('data:image/png;base64,AAAA');
    expect(await backend.hasImage()).toBe(true);
    // An image on the clipboard is not text.
    expect(await backend.readText()).toBe('');
    expect(await backend.hasText()).toBe(false);
  });

  it('reports sentinels for unsupported flavors', async () => {
    const backend = createCapacitorClipboardBackend(fakeCapacitor().capacitor);
    expect(await backend.readHtml()).toBe('');
    expect(await backend.writeHtml('<b/>')).toBe(false);
    expect(await backend.readBookmark()).toBeNull();
    expect(await backend.getFormats()).toEqual([]);
    expect(await backend.readFiles()).toEqual([]);
    expect(backend.getChangeCount()).toBe(-1);
  });

  it('resolves sentinels when the clipboard read throws', async () => {
    const capacitor = {
      clipboard: {
        async read() {
          throw new Error('denied');
        },
      },
    } as unknown as CapacitorApi;
    const backend = createCapacitorClipboardBackend(capacitor);
    expect(await backend.readText()).toBe('');
    expect(await backend.hasText()).toBe(false);
  });
});
