import type { ElectronApi, ElectronNativeImage } from '@flighthq/types';

import { createElectronClipboardBackend } from './electronClipboard';

function fakeElectron(): ElectronApi {
  const store = { text: '', html: '', rtf: '', imageDataUrl: '', bookmarkTitle: '', bookmarkUrl: '' };
  const image = (dataUrl: string): ElectronNativeImage => ({
    toDataUrl: () => dataUrl,
    isEmpty: () => dataUrl === '',
  });
  return {
    clipboard: {
      readText: () => store.text,
      writeText: (t: string) => {
        store.text = t;
      },
      readHtml: () => store.html,
      writeHtml: (h: string) => {
        store.html = h;
      },
      readRTF: () => store.rtf,
      writeRTF: (r: string) => {
        store.rtf = r;
      },
      readBookmark: () => ({ title: store.bookmarkTitle, url: store.bookmarkUrl }),
      writeBookmark: (title: string, url: string) => {
        store.bookmarkTitle = title;
        store.bookmarkUrl = url;
      },
      readImage: () => image(store.imageDataUrl),
      writeImage: (img: ElectronNativeImage) => {
        store.imageDataUrl = img.toDataUrl();
      },
      clear: () => {
        store.text = '';
        store.html = '';
        store.rtf = '';
        store.imageDataUrl = '';
        store.bookmarkTitle = '';
        store.bookmarkUrl = '';
      },
    },
    nativeImage: {
      createFromDataUrl: (dataUrl: string) => image(dataUrl),
      createFromPath: () => image(''),
    },
  } as unknown as ElectronApi;
}

describe('createElectronClipboardBackend', () => {
  it('round-trips text through the Electron clipboard', async () => {
    const backend = createElectronClipboardBackend(fakeElectron());
    expect(await backend.writeText('hi')).toBe(true);
    expect(await backend.readText()).toBe('hi');
    expect(await backend.hasText()).toBe(true);
  });

  it('round-trips HTML and RTF', async () => {
    const backend = createElectronClipboardBackend(fakeElectron());
    await backend.writeHtml('<b>x</b>');
    await backend.writeRTF('{\\rtf1 x}');
    expect(await backend.readHtml()).toBe('<b>x</b>');
    expect(await backend.readRTF()).toBe('{\\rtf1 x}');
  });

  it('round-trips an image as a data URL', async () => {
    const backend = createElectronClipboardBackend(fakeElectron());
    expect(await backend.hasImage()).toBe(false);
    await backend.writeImage('data:image/png;base64,AAAA');
    expect(await backend.readImage()).toBe('data:image/png;base64,AAAA');
    expect(await backend.hasImage()).toBe(true);
  });

  it('returns null for an empty bookmark and round-trips a set one', async () => {
    const backend = createElectronClipboardBackend(fakeElectron());
    expect(await backend.readBookmark()).toBeNull();
    await backend.writeBookmark('Flight', 'https://example.test');
    expect(await backend.readBookmark()).toEqual({ title: 'Flight', url: 'https://example.test' });
  });

  it('clears all formats', async () => {
    const backend = createElectronClipboardBackend(fakeElectron());
    await backend.writeText('x');
    expect(await backend.clear()).toBe(true);
    expect(await backend.readText()).toBe('');
  });
});
