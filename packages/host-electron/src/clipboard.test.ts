import type { ElectronApi, ElectronNativeImage } from './electronModule';
import { createElectronClipboardBackend } from './clipboard';

function fakeElectron(): ElectronApi {
  const store = { text: '', html: '', rtf: '', imageDataURL: '', bookmarkTitle: '', bookmarkUrl: '' };
  const image = (dataURL: string): ElectronNativeImage => ({
    toDataURL: () => dataURL,
    isEmpty: () => dataURL === '',
  });
  return {
    clipboard: {
      readText: () => store.text,
      writeText: (t: string) => {
        store.text = t;
      },
      readHTML: () => store.html,
      writeHTML: (h: string) => {
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
      readImage: () => image(store.imageDataURL),
      writeImage: (img: ElectronNativeImage) => {
        store.imageDataURL = img.toDataURL();
      },
      clear: () => {
        store.text = '';
        store.html = '';
        store.rtf = '';
        store.imageDataURL = '';
        store.bookmarkTitle = '';
        store.bookmarkUrl = '';
      },
    },
    nativeImage: {
      createFromDataURL: (dataURL: string) => image(dataURL),
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
    await backend.writeHTML('<b>x</b>');
    await backend.writeRTF('{\\rtf1 x}');
    expect(await backend.readHTML()).toBe('<b>x</b>');
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
