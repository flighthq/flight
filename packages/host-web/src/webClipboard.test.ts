import { ClipboardFormatText, EntityRuntimeKey } from '@flighthq/types/contract';

import { webClipboardBackend } from './webClipboard';
import { webHost } from './webHost';

afterEach(() => vi.unstubAllGlobals());

describe('webClipboardBackend', () => {
  it('is the exact provider for every web clipboard capability slot', () => {
    expect(EntityRuntimeKey in webClipboardBackend).toBe(true);
    expect(EntityRuntimeKey in webHost).toBe(true);
    expect(webHost.shortcut).toEqual({});
    expect(Object.keys(webHost.clipboard).sort()).toEqual(['change', 'formats', 'image', 'text']);
    expect(webHost.clipboard.change).toBe(webClipboardBackend);
    expect(webHost.clipboard.formats).toBe(webClipboardBackend);
    expect(webHost.clipboard.image).toBe(webClipboardBackend);
    expect(webHost.clipboard.text).toBe(webClipboardBackend);
  });

  it('uses capability sentinels when browser clipboard APIs are unavailable', async () => {
    vi.stubGlobal('navigator', {});

    expect(await webClipboardBackend.readText()).toBe('');
    expect(await webClipboardBackend.readHtml()).toBe('');
    expect(await webClipboardBackend.readImage()).toBe('');
    expect(await webClipboardBackend.readRTF()).toBe('');
    expect(await webClipboardBackend.readFormat('application/x-flight')).toBe('');
    expect(await webClipboardBackend.readItems([ClipboardFormatText])).toEqual({});
    expect(await webClipboardBackend.getFormats()).toEqual([]);
    expect(await webClipboardBackend.hasText()).toBe(false);
    expect(await webClipboardBackend.hasImage()).toBe(false);
    expect(await webClipboardBackend.hasFormat(ClipboardFormatText)).toBe(false);

    expect(await webClipboardBackend.writeText('text')).toBe(false);
    expect(await webClipboardBackend.writeHtml('<b>html</b>')).toBe(false);
    expect(await webClipboardBackend.writeImage('data:image/png;base64,AAAA')).toBe(false);
    expect(await webClipboardBackend.writeRTF('{\\rtf1 rich}')).toBe(false);
    expect(await webClipboardBackend.writeFormat('application/x-flight', 'data')).toBe(false);
    expect(await webClipboardBackend.writeItems([{ format: ClipboardFormatText, data: 'text' }])).toBe(false);
    expect(await webClipboardBackend.clear()).toBe(false);
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

    expect(await webClipboardBackend.readText()).toBe('before');
    expect(await webClipboardBackend.hasText()).toBe(true);
    expect(await webClipboardBackend.writeText('after')).toBe(true);
    expect(await webClipboardBackend.readText()).toBe('after');
    expect(await webClipboardBackend.clear()).toBe(true);
    expect(await webClipboardBackend.readText()).toBe('');
  });

  it('folds rejected browser text operations to sentinels', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn(async () => Promise.reject(new Error('denied'))),
        writeText: vi.fn(async () => Promise.reject(new Error('denied'))),
      },
    });

    expect(await webClipboardBackend.readText()).toBe('');
    expect(await webClipboardBackend.writeText('text')).toBe(false);
  });

  it('keeps change delivery inert when clipboardchange is not a standard event', () => {
    const fakeWindow = Object.assign(new EventTarget(), { clipboardchange: null });
    vi.stubGlobal('window', fakeWindow);
    let changes = 0;
    const callback = () => changes++;

    webClipboardBackend.subscribe(callback);
    fakeWindow.dispatchEvent(new Event('clipboardchange'));

    expect(changes).toBe(0);
    expect(() => webClipboardBackend.unsubscribe(callback)).not.toThrow();
  });

  it('removes the exact clipboardchange callback on unsubscribe', () => {
    const fakeWindow = Object.assign(new EventTarget(), { onclipboardchange: null });
    vi.stubGlobal('window', fakeWindow);
    let changes = 0;
    const callback = () => changes++;

    webClipboardBackend.subscribe(callback);
    fakeWindow.dispatchEvent(new Event('clipboardchange'));
    webClipboardBackend.unsubscribe(callback);
    fakeWindow.dispatchEvent(new Event('clipboardchange'));

    expect(changes).toBe(1);
  });
});
