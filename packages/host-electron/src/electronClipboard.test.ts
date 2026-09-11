import type { ElectronApi, ElectronNativeImage } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { electronHostClipboard, populateElectronHostClipboardProvider } from './electronClipboard';

function clipboardProvider(electron: ElectronApi) {
  const clipboard = electronHostClipboard(electron);
  return Object.assign(clipboard.bookmark, clipboard.formats, clipboard.image, clipboard.text);
}

function fakeElectron(): ElectronApi {
  const store = { text: '', html: '', rtf: '', imageDataUrl: '', bookmarkTitle: '', bookmarkUrl: '' };
  const image = (dataUrl: string): ElectronNativeImage => ({
    toDataURL: () => dataUrl,
    isEmpty: () => dataUrl === '',
    setTemplateImage: () => {},
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
      readImage: () => image(store.imageDataUrl),
      writeImage: (img: ElectronNativeImage) => {
        store.imageDataUrl = img.toDataURL();
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
      createFromDataURL: (dataUrl: string) => image(dataUrl),
      createFromPath: () => image(''),
    },
  } as unknown as ElectronApi;
}

function clipboardLeaf(slot: keyof ReturnType<typeof electronHostClipboard>): () => void {
  return () => {
    it('constructs an Entity-backed provider in the clipboard group', () => {
      expect(EntityRuntimeKey in electronHostClipboard(fakeElectron())[slot]).toBe(true);
    });
  };
}

describe('electronHostClipboard', () => {
  it('round-trips text through the Electron clipboard', async () => {
    const backend = clipboardProvider(fakeElectron());
    expect(EntityRuntimeKey in backend).toBe(true);
    expect(await backend.writeText('hi')).toBe(true);
    expect(await backend.readText()).toBe('hi');
    expect(await backend.hasText()).toBe(true);
  });

  it('round-trips HTML and RTF', async () => {
    const backend = clipboardProvider(fakeElectron());
    await backend.writeHtml('<b>x</b>');
    await backend.writeRTF('{\\rtf1 x}');
    expect(await backend.readHtml()).toBe('<b>x</b>');
    expect(await backend.readRTF()).toBe('{\\rtf1 x}');
  });

  it('round-trips an image as a data URL', async () => {
    const backend = clipboardProvider(fakeElectron());
    expect(await backend.hasImage()).toBe(false);
    await backend.writeImage('data:image/png;base64,AAAA');
    expect(await backend.readImage()).toBe('data:image/png;base64,AAAA');
    expect(await backend.hasImage()).toBe(true);
  });

  it('returns null for an empty bookmark and round-trips a set one', async () => {
    const backend = clipboardProvider(fakeElectron());
    expect(await backend.readBookmark()).toBeNull();
    await backend.writeBookmark('Flight', 'https://example.test');
    expect(await backend.readBookmark()).toEqual({ title: 'Flight', url: 'https://example.test' });
  });

  it('clears all formats', async () => {
    const backend = clipboardProvider(fakeElectron());
    await backend.writeText('x');
    expect(await backend.clear()).toBe(true);
    expect(await backend.readText()).toBe('');
  });
});
describe('electronHostClipboardBookmark', clipboardLeaf('bookmark'));
describe('electronHostClipboardFormats', clipboardLeaf('formats'));
describe('electronHostClipboardImage', clipboardLeaf('image'));

describe('electronHostClipboardText', clipboardLeaf('text'));
describe('populateElectronHostClipboardProvider', () => {
  it('is the construction initializer used by electronHostClipboard leaves', () => {
    expect(typeof populateElectronHostClipboardProvider).toBe('function');
  });
});
