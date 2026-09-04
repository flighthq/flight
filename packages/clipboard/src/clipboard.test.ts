import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ClipboardBookmark,
  ClipboardBookmarkBackend,
  ClipboardChangeBackend,
  ClipboardFormatsBackend,
  ClipboardImageBackend,
  ClipboardTextBackend,
  HasClipboardBookmark,
  HasClipboardChange,
  HasClipboardFormats,
  HasClipboardImage,
  HasClipboardText,
} from '@flighthq/types/contract';
import {
  ClipboardFormatBookmark,
  ClipboardFormatHtml,
  ClipboardFormatImage,
  ClipboardFormatRtf,
  ClipboardFormatText,
  EntityRuntimeKey,
} from '@flighthq/types/contract';

import {
  attachClipboardWatch,
  clearClipboard,
  createClipboardWatch,
  detachClipboardWatch,
  disposeClipboardWatch,
  getClipboardFormats,
  hasClipboardBookmark,
  hasClipboardFormat,
  hasClipboardHtml,
  hasClipboardImage,
  hasClipboardRTF,
  hasClipboardText,
  readClipboard,
  readClipboardBookmark,
  readClipboardFormat,
  readClipboardHtml,
  readClipboardImage,
  readClipboardRTF,
  readClipboardText,
  writeClipboard,
  writeClipboardBookmark,
  writeClipboardFormat,
  writeClipboardHtml,
  writeClipboardImage,
  writeClipboardRTF,
  writeClipboardText,
} from './clipboard';

describe('attachClipboardWatch', () => {
  it('is exported', () => expect(attachClipboardWatch).toBeTypeOf('function'));
});

describe('clearClipboard', () => {
  it('is exported', () => expect(clearClipboard).toBeTypeOf('function'));
});

describe('clipboard', () => {
  it('routes each operation through its supplied clipboard capability slot', async () => {
    const backend = fakeBackend();
    const host = hostFor(backend);
    expect(EntityRuntimeKey in backend).toBe(true);

    expect(
      await writeClipboard(host, [
        { format: ClipboardFormatText, data: 'multi-text' },
        { format: ClipboardFormatHtml, data: '<b>multi</b>' },
      ]),
    ).toBe(true);
    expect(await writeClipboardText(host, 'plain')).toBe(true);
    expect(await writeClipboardHtml(host, '<b>html</b>')).toBe(true);
    expect(await writeClipboardImage(host, 'data:image/png;base64,AAAA')).toBe(true);
    expect(await writeClipboardRTF(host, '{\\rtf1 rich}')).toBe(true);
    expect(await writeClipboardBookmark(host, 'Flight', 'https://example.com')).toBe(true);
    expect(await writeClipboardFormat(host, 'application/x-flight', 'custom')).toBe(true);

    expect(await readClipboardText(host)).toBe('plain');
    expect(await readClipboardHtml(host)).toBe('<b>html</b>');
    expect(await readClipboardImage(host)).toBe('data:image/png;base64,AAAA');
    expect(await readClipboardRTF(host)).toBe('{\\rtf1 rich}');
    expect(await readClipboardBookmark(host)).toEqual({ title: 'Flight', url: 'https://example.com' });
    expect(await readClipboardFormat(host, 'application/x-flight')).toBe('custom');
    expect(await readClipboard(host, [ClipboardFormatText, 'application/x-flight', 'missing'])).toEqual({
      [ClipboardFormatText]: 'plain',
      'application/x-flight': 'custom',
    });

    expect(await hasClipboardText(host)).toBe(true);
    expect(await hasClipboardHtml(host)).toBe(true);
    expect(await hasClipboardImage(host)).toBe(true);
    expect(await hasClipboardRTF(host)).toBe(true);
    expect(await hasClipboardBookmark(host)).toBe(true);
    expect(await hasClipboardFormat(host, 'application/x-flight')).toBe(true);
    expect(await getClipboardFormats(host)).toEqual(
      expect.arrayContaining([
        ClipboardFormatText,
        ClipboardFormatHtml,
        ClipboardFormatImage,
        ClipboardFormatRtf,
        ClipboardFormatBookmark,
        'application/x-flight',
      ]),
    );

    expect(await clearClipboard(host)).toBe(true);
    expect(await readClipboardText(host)).toBe('');
    expect(await getClipboardFormats(host)).toEqual([]);
  });

  it('never consults another host when two clipboard providers coexist', async () => {
    const first = hostFor(fakeBackend());
    const second = hostFor(fakeBackend());

    await writeClipboardText(first, 'first');
    await writeClipboardText(second, 'second');

    expect(await readClipboardText(first)).toBe('first');
    expect(await readClipboardText(second)).toBe('second');
  });
});

describe('ClipboardWatch', () => {
  it('pins the subscription to the supplied host until explicitly attached elsewhere', () => {
    const firstBackend = fakeBackend();
    const secondBackend = fakeBackend();
    const watch = createClipboardWatch();
    let changes = 0;
    watch.onChange.emit = () => {
      changes++;
    };

    attachClipboardWatch(hostFor(firstBackend), watch);
    expect(firstBackend.listeners.size).toBe(1);
    firstBackend.listeners.forEach((listener) => listener());
    expect(changes).toBe(1);

    attachClipboardWatch(hostFor(secondBackend), watch);
    expect(firstBackend.listeners.size).toBe(0);
    expect(secondBackend.listeners.size).toBe(1);
    firstBackend.listeners.forEach((listener) => listener());
    secondBackend.listeners.forEach((listener) => listener());
    expect(changes).toBe(2);

    detachClipboardWatch(watch);
    expect(secondBackend.listeners.size).toBe(0);
    expect(() => detachClipboardWatch(watch)).not.toThrow();
  });

  it('is idempotent per watch and dispose releases the active subscription', () => {
    const backend = fakeBackend();
    const host = hostFor(backend);
    const watch = createClipboardWatch();

    attachClipboardWatch(host, watch);
    attachClipboardWatch(host, watch);
    expect(backend.listeners.size).toBe(1);

    disposeClipboardWatch(watch);
    expect(backend.listeners.size).toBe(0);
  });
});

describe('createClipboardWatch', () => {
  it('is exported', () => expect(createClipboardWatch).toBeTypeOf('function'));
});

describe('detachClipboardWatch', () => {
  it('is exported', () => expect(detachClipboardWatch).toBeTypeOf('function'));
});

describe('disposeClipboardWatch', () => {
  it('is exported', () => expect(disposeClipboardWatch).toBeTypeOf('function'));
});

describe('getClipboardFormats', () => {
  it('is exported', () => expect(getClipboardFormats).toBeTypeOf('function'));
});

describe('hasClipboardBookmark', () => {
  it('is exported', () => expect(hasClipboardBookmark).toBeTypeOf('function'));
});

describe('hasClipboardFormat', () => {
  it('is exported', () => expect(hasClipboardFormat).toBeTypeOf('function'));
});

describe('hasClipboardHtml', () => {
  it('is exported', () => expect(hasClipboardHtml).toBeTypeOf('function'));
});

describe('hasClipboardImage', () => {
  it('is exported', () => expect(hasClipboardImage).toBeTypeOf('function'));
});

describe('hasClipboardRTF', () => {
  it('is exported', () => expect(hasClipboardRTF).toBeTypeOf('function'));
});

describe('hasClipboardText', () => {
  it('is exported', () => expect(hasClipboardText).toBeTypeOf('function'));
});

describe('readClipboard', () => {
  it('is exported', () => expect(readClipboard).toBeTypeOf('function'));
});

describe('readClipboardBookmark', () => {
  it('is exported', () => expect(readClipboardBookmark).toBeTypeOf('function'));
});

describe('readClipboardFormat', () => {
  it('is exported', () => expect(readClipboardFormat).toBeTypeOf('function'));
});

describe('readClipboardHtml', () => {
  it('is exported', () => expect(readClipboardHtml).toBeTypeOf('function'));
});

describe('readClipboardImage', () => {
  it('is exported', () => expect(readClipboardImage).toBeTypeOf('function'));
});

describe('readClipboardRTF', () => {
  it('is exported', () => expect(readClipboardRTF).toBeTypeOf('function'));
});

describe('readClipboardText', () => {
  it('is exported', () => expect(readClipboardText).toBeTypeOf('function'));
});

describe('writeClipboard', () => {
  it('is exported', () => expect(writeClipboard).toBeTypeOf('function'));
});

describe('writeClipboardBookmark', () => {
  it('is exported', () => expect(writeClipboardBookmark).toBeTypeOf('function'));
});

describe('writeClipboardFormat', () => {
  it('is exported', () => expect(writeClipboardFormat).toBeTypeOf('function'));
});

describe('writeClipboardHtml', () => {
  it('is exported', () => expect(writeClipboardHtml).toBeTypeOf('function'));
});

describe('writeClipboardImage', () => {
  it('is exported', () => expect(writeClipboardImage).toBeTypeOf('function'));
});

interface FakeClipboardBackend
  extends
    ClipboardBookmarkBackend,
    Required<Pick<ClipboardChangeBackend, 'subscribe' | 'unsubscribe'>>,
    ClipboardFormatsBackend,
    ClipboardImageBackend,
    ClipboardTextBackend {
  bookmark: ClipboardBookmark | null;
  formats: Record<string, string>;
  html: string;
  image: string;
  readonly listeners: Set<() => void>;
  rtf: string;
  text: string;
}

type FakeClipboardHost = HasClipboardBookmark &
  HasClipboardChange &
  HasClipboardFormats &
  HasClipboardImage &
  HasClipboardText;

function hostFor(clipboard: FakeClipboardBackend): FakeClipboardHost {
  return {
    clipboard: {
      bookmark: clipboard,
      change: clipboard,
      formats: clipboard,
      image: clipboard,
      text: clipboard,
    },
  };
}

function fakeBackend(): FakeClipboardBackend {
  const out = allocateEntity<any>();
  out.bookmark = null;
  out.formats = {};
  out.html = '';
  out.image = '';
  out.listeners = new Set();
  out.rtf = '';
  out.text = '';
  out.clear = async () => {
    out.bookmark = null;
    out.formats = {};
    out.html = '';
    out.image = '';
    out.rtf = '';
    out.text = '';
    return true;
  };
  out.getFormats = async () => {
    const formats = Object.keys(out.formats);
    if (out.text.length > 0) formats.push(ClipboardFormatText);
    if (out.html.length > 0) formats.push(ClipboardFormatHtml);
    if (out.image.length > 0) formats.push(ClipboardFormatImage);
    if (out.rtf.length > 0) formats.push(ClipboardFormatRtf);
    if (out.bookmark !== null) formats.push(ClipboardFormatBookmark);
    return [...new Set(formats)];
  };
  out.hasFormat = async (format: string) => {
    return (await out.getFormats()).includes(format);
  };
  out.hasImage = async () => {
    return out.image.length > 0;
  };
  out.hasText = async () => {
    return out.text.length > 0;
  };
  out.readBookmark = async () => {
    return out.bookmark;
  };
  out.readFormat = async (format: string) => {
    if (format === ClipboardFormatText) return out.text;
    if (format === ClipboardFormatHtml) return out.html;
    if (format === ClipboardFormatImage) return out.image;
    if (format === ClipboardFormatRtf) return out.rtf;
    return out.formats[format] ?? '';
  };
  out.readHtml = async () => {
    return out.html;
  };
  out.readImage = async () => {
    return out.image;
  };
  out.readItems = async (formats: string[]) => {
    const result: Record<string, string> = {};
    for (const format of formats) {
      const data = await out.readFormat(format);
      if (data.length > 0) result[format] = data;
    }
    return result;
  };
  out.readRTF = async () => {
    return out.rtf;
  };
  out.readText = async () => {
    return out.text;
  };
  out.subscribe = (callback: () => void) => {
    out.listeners.add(callback);
  };
  out.unsubscribe = (callback: () => void) => {
    out.listeners.delete(callback);
  };
  out.writeBookmark = async (title: string, url: string) => {
    out.bookmark = { title, url };
    return true;
  };
  out.writeFormat = async (format: string, data: string) => {
    if (format === ClipboardFormatText) out.text = data;
    else if (format === ClipboardFormatHtml) out.html = data;
    else if (format === ClipboardFormatImage) out.image = data;
    else if (format === ClipboardFormatRtf) out.rtf = data;
    else out.formats[format] = data;
    return true;
  };
  out.writeHtml = async (html: string) => {
    out.html = html;
    return true;
  };
  out.writeImage = async (dataUrl: string) => {
    out.image = dataUrl;
    return true;
  };
  out.writeItems = async (items: ReadonlyArray<{ format: string; data: string }>) => {
    for (const item of items) await out.writeFormat(item.format, item.data);
    return true;
  };
  out.writeRTF = async (rtf: string) => {
    out.rtf = rtf;
    return true;
  };
  out.writeText = async (text: string) => {
    out.text = text;
    return true;
  };
  return finishEntity(out);
}

describe('writeClipboardRTF', () => {
  it('is exported', () => expect(writeClipboardRTF).toBeTypeOf('function'));
});

describe('writeClipboardText', () => {
  it('is exported', () => expect(writeClipboardText).toBeTypeOf('function'));
});
