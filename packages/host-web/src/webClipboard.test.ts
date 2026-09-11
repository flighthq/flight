import { ClipboardFormatText, EntityRuntimeKey } from '@flighthq/types/contract';

import {
  initializeWebClipboardBackend,
  webClipboardBackend,
  webHostClipboardChange,
  webHostClipboardFormats,
  webHostClipboardImage,
  webHostClipboardText,
} from './webClipboard';
import { webHost } from './webHost';

afterEach(() => vi.unstubAllGlobals());

describe('initializeWebClipboardBackend', () => {
  it('is the construction initializer of createWebClipboardBackend', () => {
    expect(typeof initializeWebClipboardBackend).toBe('function');
  });
});
describe('webHostClipboard providers', () => {
  it('decomposes the legacy provider into four exact Host leaves', () => {
    expect(EntityRuntimeKey in webClipboardBackend).toBe(true);
    expect(EntityRuntimeKey in webHost).toBe(true);
    expect(webHost.shortcut).toEqual({});
    expect(Object.keys(webHost.clipboard).sort()).toEqual(['change', 'formats', 'image', 'text']);
    expect(webHost.clipboard.change).toBe(webHostClipboardChange);
    expect(webHost.clipboard.formats).toBe(webHostClipboardFormats);
    expect(webHost.clipboard.image).toBe(webHostClipboardImage);
    expect(webHost.clipboard.text).toBe(webHostClipboardText);
    expect(new Set(Object.values(webHost.clipboard)).size).toBe(4);
  });

  it('uses capability sentinels when browser clipboard APIs are unavailable', async () => {
    vi.stubGlobal('navigator', {});

    expect(await webHostClipboardText.readText()).toBe('');
    expect(await webHostClipboardFormats.readHtml()).toBe('');
    expect(await webHostClipboardImage.readImage()).toBe('');
    expect(await webHostClipboardFormats.readRTF()).toBe('');
    expect(await webHostClipboardFormats.readFormat('application/x-flight')).toBe('');
    expect(await webHostClipboardFormats.readItems([ClipboardFormatText])).toEqual({});
    expect(await webHostClipboardFormats.getFormats()).toEqual([]);
    expect(await webHostClipboardText.hasText()).toBe(false);
    expect(await webHostClipboardImage.hasImage()).toBe(false);
    expect(await webHostClipboardFormats.hasFormat(ClipboardFormatText)).toBe(false);

    expect(await webHostClipboardText.writeText('text')).toBe(false);
    expect(await webHostClipboardFormats.writeHtml('<b>html</b>')).toBe(false);
    expect(await webHostClipboardImage.writeImage('data:image/png;base64,AAAA')).toBe(false);
    expect(await webHostClipboardFormats.writeRTF('{\\rtf1 rich}')).toBe(false);
    expect(await webHostClipboardFormats.writeFormat('application/x-flight', 'data')).toBe(false);
    expect(await webHostClipboardFormats.writeItems([{ format: ClipboardFormatText, data: 'text' }])).toBe(false);
    expect(await webHostClipboardText.clear()).toBe(false);
  });

  it('routes text operations through the supplied browser environment', async () => {
    let value = 'before';
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn(async () => value),
        writeText: vi.fn(async (next: string) => {
          value = next;
        }),
      },
    });

    expect(await webHostClipboardText.readText()).toBe('before');
    expect(await webHostClipboardText.hasText()).toBe(true);
    expect(await webHostClipboardText.writeText('after')).toBe(true);
    expect(await webHostClipboardText.readText()).toBe('after');
    expect(await webHostClipboardText.clear()).toBe(true);
    expect(await webHostClipboardText.readText()).toBe('');
  });

  it('folds rejected browser text operations to sentinels', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn(async () => Promise.reject(new Error('denied'))),
        writeText: vi.fn(async () => Promise.reject(new Error('denied'))),
      },
    });

    expect(await webHostClipboardText.readText()).toBe('');
    expect(await webHostClipboardText.writeText('text')).toBe(false);
  });

  it('keeps change delivery inert when clipboardchange is not a standard event', () => {
    const fakeWindow = Object.assign(new EventTarget(), { clipboardchange: null });
    vi.stubGlobal('window', fakeWindow);
    let changes = 0;
    const callback = () => changes++;

    webHostClipboardChange.subscribe(callback);
    fakeWindow.dispatchEvent(new Event('clipboardchange'));

    expect(changes).toBe(0);
    expect(() => webHostClipboardChange.unsubscribe(callback)).not.toThrow();
  });

  it('removes the exact clipboardchange callback on unsubscribe', () => {
    const fakeWindow = Object.assign(new EventTarget(), { onclipboardchange: null });
    vi.stubGlobal('window', fakeWindow);
    let changes = 0;
    const callback = () => changes++;

    webHostClipboardChange.subscribe(callback);
    fakeWindow.dispatchEvent(new Event('clipboardchange'));
    webHostClipboardChange.unsubscribe(callback);
    fakeWindow.dispatchEvent(new Event('clipboardchange'));

    expect(changes).toBe(1);
  });
});
