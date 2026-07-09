import type { ClipboardBackend, ClipboardBookmark } from '@flighthq/types';
import {
  ClipboardFormatBookmark,
  ClipboardFormatHtml,
  ClipboardFormatImage,
  ClipboardFormatRtf,
  ClipboardFormatText,
} from '@flighthq/types';

import {
  attachClipboardWatch,
  clearClipboard,
  createClipboardWatch,
  createWebClipboardBackend,
  detachClipboardWatch,
  disposeClipboardWatch,
  getClipboardBackend,
  getClipboardChangeCount,
  getClipboardFormats,
  hasClipboardBookmark,
  hasClipboardFormat,
  hasClipboardHtml,
  hasClipboardImage,
  hasClipboardRTF,
  hasClipboardText,
  readClipboard,
  readClipboardBookmark,
  readClipboardFiles,
  readClipboardFormat,
  readClipboardHtml,
  readClipboardImage,
  readClipboardRTF,
  readClipboardText,
  setClipboardBackend,
  writeClipboard,
  writeClipboardBookmark,
  writeClipboardFiles,
  writeClipboardFormat,
  writeClipboardHtml,
  writeClipboardImage,
  writeClipboardRTF,
  writeClipboardText,
} from './clipboard';

function fakeBackend(): ClipboardBackend & {
  text: string;
  html: string;
  image: string;
  rtf: string;
  bookmark: ClipboardBookmark | null;
  files: string[];
  formats: Record<string, string>;
  changeCount: number;
} {
  return {
    text: '',
    html: '',
    image: '',
    rtf: '',
    bookmark: null,
    files: [],
    formats: {},
    changeCount: 0,
    async readFormat(format) {
      if (format === ClipboardFormatText) return this.text;
      if (format === ClipboardFormatHtml) return this.html;
      if (format === ClipboardFormatRtf) return this.rtf;
      return this.formats[format] ?? '';
    },
    async writeFormat(format, data) {
      if (format === ClipboardFormatText) this.text = data;
      else if (format === ClipboardFormatHtml) this.html = data;
      else if (format === ClipboardFormatRtf) this.rtf = data;
      else this.formats[format] = data;
      this.changeCount++;
      return true;
    },
    async hasFormat(format) {
      const data = await this.readFormat(format);
      return data.length > 0;
    },
    async getFormats() {
      const out: string[] = [];
      if (this.text.length > 0) out.push(ClipboardFormatText);
      if (this.html.length > 0) out.push(ClipboardFormatHtml);
      if (this.rtf.length > 0) out.push(ClipboardFormatRtf);
      if (this.image.length > 0) out.push(ClipboardFormatImage);
      if (this.bookmark !== null) out.push(ClipboardFormatBookmark);
      for (const k of Object.keys(this.formats)) out.push(k);
      return out;
    },
    async writeItems(items) {
      for (const item of items) await this.writeFormat(item.format, item.data);
      return true;
    },
    async readItems(formats) {
      const result: Record<string, string> = {};
      for (const format of formats) {
        const data = await this.readFormat(format);
        if (data.length > 0) result[format] = data;
      }
      return result;
    },
    async readText() {
      return this.text;
    },
    async writeText(text) {
      this.text = text;
      this.changeCount++;
      return true;
    },
    async readHtml() {
      return this.html;
    },
    async writeHtml(html) {
      this.html = html;
      this.changeCount++;
      return true;
    },
    async hasText() {
      return this.text.length > 0;
    },
    async readImage() {
      return this.image;
    },
    async writeImage(dataUrl) {
      this.image = dataUrl;
      this.changeCount++;
      return true;
    },
    async hasImage() {
      return this.image.length > 0;
    },
    async readRTF() {
      return this.rtf;
    },
    async writeRTF(rtf) {
      this.rtf = rtf;
      this.changeCount++;
      return true;
    },
    async readBookmark() {
      return this.bookmark;
    },
    async writeBookmark(title, url) {
      this.bookmark = { title, url };
      this.changeCount++;
      return true;
    },
    async readFiles() {
      return [...this.files];
    },
    async writeFiles(paths) {
      this.files = [...paths];
      this.changeCount++;
      return true;
    },
    async clear() {
      this.text = '';
      this.html = '';
      this.image = '';
      this.rtf = '';
      this.bookmark = null;
      this.files = [];
      this.formats = {};
      this.changeCount++;
      return true;
    },
    getChangeCount() {
      return this.changeCount;
    },
    subscribeClipboardChange(listener) {
      const listeners = (this as unknown as { _listeners: Array<() => void> })._listeners;
      if (!listeners) (this as unknown as { _listeners: Array<() => void> })._listeners = [];
      (this as unknown as { _listeners: Array<() => void> })._listeners.push(listener);
      return () => {
        const idx = (this as unknown as { _listeners: Array<() => void> })._listeners.indexOf(listener);
        if (idx >= 0) (this as unknown as { _listeners: Array<() => void> })._listeners.splice(idx, 1);
      };
    },
  };
}

afterEach(() => setClipboardBackend(null));

describe('attachClipboardWatch', () => {
  it('emits onChange when the backend notifies', () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    const watch = createClipboardWatch();
    let count = 0;
    watch.onChange.emit = () => {
      count++;
    };
    attachClipboardWatch(watch);
    // Simulate backend notification by calling all subscribed listeners
    const listeners = (backend as unknown as { _listeners: Array<() => void> })._listeners;
    expect(listeners.length).toBeGreaterThan(0);
    listeners.forEach((l) => l());
    expect(count).toBeGreaterThan(0);
    disposeClipboardWatch(watch);
  });

  it('is idempotent — attaching twice only has one active subscription', () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    const watch = createClipboardWatch();
    attachClipboardWatch(watch);
    attachClipboardWatch(watch);
    const listeners = (backend as unknown as { _listeners: Array<() => void> })._listeners ?? [];
    expect(listeners.length).toBe(1);
    disposeClipboardWatch(watch);
  });
});

describe('clearClipboard', () => {
  it('clears via the active backend', async () => {
    const backend = fakeBackend();
    backend.text = 'x';
    setClipboardBackend(backend);
    expect(await clearClipboard()).toBe(true);
    expect(backend.text).toBe('');
  });
});

describe('createClipboardWatch', () => {
  it('returns an entity with an onChange signal', () => {
    const watch = createClipboardWatch();
    expect(watch.onChange).toBeDefined();
  });
});

describe('createWebClipboardBackend', () => {
  it('returns a backend whose reads yield strings without throwing', async () => {
    const backend = createWebClipboardBackend();
    expect(typeof (await backend.readText())).toBe('string');
    expect(typeof (await backend.readHtml())).toBe('string');
    expect(typeof (await backend.readFormat(ClipboardFormatText))).toBe('string');
  });

  it('getFormats returns an array without throwing', async () => {
    const backend = createWebClipboardBackend();
    const formats = await backend.getFormats();
    expect(Array.isArray(formats)).toBe(true);
  });

  it('getChangeCount returns -1 (unsupported on web)', () => {
    const backend = createWebClipboardBackend();
    expect(backend.getChangeCount()).toBe(-1);
  });

  it('subscribeClipboardChange returns a function without throwing', () => {
    const backend = createWebClipboardBackend();
    const unsub = backend.subscribeClipboardChange(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('detachClipboardWatch', () => {
  it('stops delivery after detach', () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    const watch = createClipboardWatch();
    let count = 0;
    watch.onChange.emit = () => {
      count++;
    };
    attachClipboardWatch(watch);
    detachClipboardWatch(watch);
    const listeners = (backend as unknown as { _listeners: Array<() => void> })._listeners ?? [];
    expect(listeners.length).toBe(0);
    expect(count).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const watch = createClipboardWatch();
    expect(() => detachClipboardWatch(watch)).not.toThrow();
  });
});

describe('disposeClipboardWatch', () => {
  it('detaches and does not throw', () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    const watch = createClipboardWatch();
    attachClipboardWatch(watch);
    expect(() => disposeClipboardWatch(watch)).not.toThrow();
    const listeners = (backend as unknown as { _listeners: Array<() => void> })._listeners ?? [];
    expect(listeners.length).toBe(0);
  });
});

describe('getClipboardBackend', () => {
  it('falls back to a web backend', () => {
    expect(getClipboardBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(getClipboardBackend()).toBe(backend);
  });
});

describe('getClipboardChangeCount', () => {
  it('reflects the backend change count', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    const before = getClipboardChangeCount();
    await writeClipboardText('x');
    expect(getClipboardChangeCount()).toBe(before + 1);
  });

  it('returns -1 from the web backend', () => {
    expect(createWebClipboardBackend().getChangeCount()).toBe(-1);
  });
});

describe('getClipboardFormats', () => {
  it('returns the active formats from the backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await getClipboardFormats()).toEqual([]);
    await writeClipboardText('hi');
    const formats = await getClipboardFormats();
    expect(formats).toContain(ClipboardFormatText);
  });

  it('returns [] from the web backend without throwing', async () => {
    const formats = await createWebClipboardBackend().getFormats();
    expect(Array.isArray(formats)).toBe(true);
  });
});

describe('hasClipboardBookmark', () => {
  it('returns false when no bookmark is present', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardBookmark()).toBe(false);
  });

  it('returns true after a bookmark is written by the backend', async () => {
    const backend = fakeBackend();
    // Simulate a backend that puts ClipboardFormatBookmark in formats when a bookmark is written
    backend.formats[ClipboardFormatBookmark] = 'https://example.com\nFlight';
    setClipboardBackend(backend);
    expect(await hasClipboardBookmark()).toBe(true);
  });
});

describe('hasClipboardFormat', () => {
  it('reflects whether a format is present', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardFormat(ClipboardFormatText)).toBe(false);
    await writeClipboardText('x');
    expect(await hasClipboardFormat(ClipboardFormatText)).toBe(true);
  });
});

describe('hasClipboardHtml', () => {
  it('reflects backend state', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardHtml()).toBe(false);
    await writeClipboardHtml('<b>x</b>');
    expect(await hasClipboardHtml()).toBe(true);
  });
});

describe('hasClipboardImage', () => {
  it('reflects backend state', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardImage()).toBe(false);
    await writeClipboardImage('data:image/png;base64,AAAA');
    expect(await hasClipboardImage()).toBe(true);
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().hasImage()).toBe(false);
  });
});

describe('hasClipboardRTF', () => {
  it('reflects backend state', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardRTF()).toBe(false);
    await writeClipboardRTF('{\\rtf1 hi}');
    expect(await hasClipboardRTF()).toBe(true);
  });
});

describe('hasClipboardText', () => {
  it('reflects backend state', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardText()).toBe(false);
    await writeClipboardText('hi');
    expect(await hasClipboardText()).toBe(true);
  });
});

describe('readClipboard', () => {
  it('reads multiple formats in one call', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    await writeClipboardText('hello');
    await writeClipboardHtml('<b>hello</b>');
    const result = await readClipboard([ClipboardFormatText, ClipboardFormatHtml]);
    expect(result[ClipboardFormatText]).toBe('hello');
    expect(result[ClipboardFormatHtml]).toBe('<b>hello</b>');
  });

  it('omits formats that are not present', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    await writeClipboardText('hi');
    const result = await readClipboard([ClipboardFormatText, ClipboardFormatRtf]);
    expect(result[ClipboardFormatText]).toBe('hi');
    expect(result[ClipboardFormatRtf]).toBeUndefined();
  });

  it('returns {} from the web backend without throwing', async () => {
    const result = await createWebClipboardBackend().readItems([ClipboardFormatText]);
    expect(typeof result).toBe('object');
  });
});

describe('readClipboardBookmark', () => {
  it('round-trips through the backend', async () => {
    setClipboardBackend(fakeBackend());
    await writeClipboardBookmark('Flight', 'https://example.com');
    expect(await readClipboardBookmark()).toEqual({ title: 'Flight', url: 'https://example.com' });
  });

  it('returns the null sentinel from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().readBookmark()).toBeNull();
  });
});

describe('readClipboardFiles', () => {
  it('round-trips file paths through the backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    await writeClipboardFiles(['/a/b.txt', '/c/d.txt']);
    expect(await readClipboardFiles()).toEqual(['/a/b.txt', '/c/d.txt']);
  });

  it('returns [] from the web backend without throwing', async () => {
    const files = await createWebClipboardBackend().readFiles();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBe(0);
  });
});

describe('readClipboardFormat', () => {
  it('round-trips an arbitrary format through the backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    await writeClipboardFormat('application/x-custom', 'mydata');
    expect(await readClipboardFormat('application/x-custom')).toBe('mydata');
  });

  it('returns the empty-string sentinel from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().readFormat('application/x-custom')).toBe('');
  });
});

describe('readClipboardHtml', () => {
  it('round-trips through the backend', async () => {
    setClipboardBackend(fakeBackend());
    await writeClipboardHtml('<b>x</b>');
    expect(await readClipboardHtml()).toBe('<b>x</b>');
  });
});

describe('readClipboardImage', () => {
  it('round-trips through the backend', async () => {
    setClipboardBackend(fakeBackend());
    await writeClipboardImage('data:image/png;base64,BBBB');
    expect(await readClipboardImage()).toBe('data:image/png;base64,BBBB');
  });

  it('returns the empty-string sentinel from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().readImage()).toBe('');
  });
});

describe('readClipboardRTF', () => {
  it('round-trips through the backend', async () => {
    setClipboardBackend(fakeBackend());
    await writeClipboardRTF('{\\rtf1 hi}');
    expect(await readClipboardRTF()).toBe('{\\rtf1 hi}');
  });

  it('returns the empty-string sentinel from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().readRTF()).toBe('');
  });
});

describe('readClipboardText', () => {
  it('round-trips through the backend', async () => {
    setClipboardBackend(fakeBackend());
    await writeClipboardText('hello');
    expect(await readClipboardText()).toBe('hello');
  });
});

describe('setClipboardBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setClipboardBackend(fakeBackend());
    setClipboardBackend(null);
    expect(getClipboardBackend()).not.toBeNull();
  });
});

describe('writeClipboard', () => {
  it('writes multiple formats atomically', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(
      await writeClipboard([
        { format: ClipboardFormatText, data: 'hello' },
        { format: ClipboardFormatHtml, data: '<b>hello</b>' },
      ]),
    ).toBe(true);
    expect(backend.text).toBe('hello');
    expect(backend.html).toBe('<b>hello</b>');
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().writeItems([{ format: ClipboardFormatText, data: 'x' }])).toBe(false);
  });
});

describe('writeClipboardBookmark', () => {
  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardBookmark('Flight', 'https://example.com')).toBe(true);
    expect(backend.bookmark).toEqual({ title: 'Flight', url: 'https://example.com' });
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().writeBookmark('Flight', 'https://example.com')).toBe(false);
  });
});

describe('writeClipboardFiles', () => {
  it('writes file paths via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardFiles(['/a/b.txt'])).toBe(true);
    expect(backend.files).toEqual(['/a/b.txt']);
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().writeFiles(['/a.txt'])).toBe(false);
  });
});

describe('writeClipboardFormat', () => {
  it('writes an arbitrary format via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardFormat('application/x-custom', 'data')).toBe(true);
    expect(backend.formats['application/x-custom']).toBe('data');
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().writeFormat('application/x-custom', 'data')).toBe(false);
  });
});

describe('writeClipboardHtml', () => {
  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardHtml('<i>y</i>')).toBe(true);
    expect(backend.html).toBe('<i>y</i>');
  });
});

describe('writeClipboardImage', () => {
  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardImage('data:image/png;base64,CCCC')).toBe(true);
    expect(backend.image).toBe('data:image/png;base64,CCCC');
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().writeImage('data:image/png;base64,DDDD')).toBe(false);
  });
});

describe('writeClipboardRTF', () => {
  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardRTF('{\\rtf1 z}')).toBe(true);
    expect(backend.rtf).toBe('{\\rtf1 z}');
  });

  it('returns false from the web backend without throwing', async () => {
    expect(await createWebClipboardBackend().writeRTF('{\\rtf1 z}')).toBe(false);
  });
});

describe('writeClipboardText', () => {
  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardText('z')).toBe(true);
    expect(backend.text).toBe('z');
  });
});
