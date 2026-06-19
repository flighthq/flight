import type { ClipboardBackend, ClipboardBookmark } from '@flighthq/types';

import {
  clearClipboard,
  createWebClipboardBackend,
  getClipboardBackend,
  hasClipboardImage,
  hasClipboardText,
  readClipboardBookmark,
  readClipboardHTML,
  readClipboardImage,
  readClipboardRTF,
  readClipboardText,
  setClipboardBackend,
  writeClipboardBookmark,
  writeClipboardHTML,
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
} {
  return {
    text: '',
    html: '',
    image: '',
    rtf: '',
    bookmark: null,
    async readText() {
      return this.text;
    },
    async writeText(text) {
      this.text = text;
      return true;
    },
    async readHTML() {
      return this.html;
    },
    async writeHTML(html) {
      this.html = html;
      return true;
    },
    async hasText() {
      return this.text.length > 0;
    },
    async readImage() {
      return this.image;
    },
    async writeImage(dataURL) {
      this.image = dataURL;
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
      return true;
    },
    async readBookmark() {
      return this.bookmark;
    },
    async writeBookmark(title, url) {
      this.bookmark = { title, url };
      return true;
    },
    async clear() {
      this.text = '';
      this.html = '';
      this.image = '';
      this.rtf = '';
      this.bookmark = null;
      return true;
    },
  };
}

afterEach(() => setClipboardBackend(null));

describe('clearClipboard', () => {
  it('clears via the active backend', async () => {
    const backend = fakeBackend();
    backend.text = 'x';
    setClipboardBackend(backend);
    expect(await clearClipboard()).toBe(true);
    expect(backend.text).toBe('');
  });
});

describe('createWebClipboardBackend', () => {
  it('returns a backend whose reads yield strings without throwing', async () => {
    const backend = createWebClipboardBackend();
    expect(typeof (await backend.readText())).toBe('string');
    expect(typeof (await backend.readHTML())).toBe('string');
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

describe('hasClipboardText', () => {
  it('reflects backend state', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await hasClipboardText()).toBe(false);
    await writeClipboardText('hi');
    expect(await hasClipboardText()).toBe(true);
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

describe('readClipboardHTML', () => {
  it('round-trips through the backend', async () => {
    setClipboardBackend(fakeBackend());
    await writeClipboardHTML('<b>x</b>');
    expect(await readClipboardHTML()).toBe('<b>x</b>');
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

describe('writeClipboardHTML', () => {
  it('writes via the active backend', async () => {
    const backend = fakeBackend();
    setClipboardBackend(backend);
    expect(await writeClipboardHTML('<i>y</i>')).toBe(true);
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
