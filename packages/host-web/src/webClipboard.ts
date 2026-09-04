import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ClipboardChangeBackend,
  ClipboardFormatsBackend,
  ClipboardImageBackend,
  ClipboardTextBackend,
  EntityConstruction,
} from '@flighthq/types/contract';
import { ClipboardFormatHtml, ClipboardFormatRtf } from '@flighthq/types/contract';

// Browser clipboard provider. Reads return the capability sentinels when the API is absent (non-secure
// context, jsdom) or the user denies permission.
type WebClipboardBackend = ClipboardFormatsBackend &
  ClipboardImageBackend &
  ClipboardTextBackend &
  Required<Pick<ClipboardChangeBackend, 'subscribe' | 'unsubscribe'>>;

export function initializeWebClipboardBackend(out: EntityConstruction<WebClipboardBackend>): void {
  async function blobFromFormatData(format: string, data: string): Promise<Blob> {
    if (format.startsWith('image/') && data.startsWith('data:')) {
      const response = await fetch(data);
      return response.blob();
    }
    return new Blob([data], { type: format });
  }

  async function readFormat(format: string): Promise<string> {
    const cb = getWebClipboard();
    if (cb === null || typeof cb.read !== 'function') return '';
    try {
      const items = await cb.read();
      for (const item of items) {
        if (item.types.includes(format)) {
          const blob = await item.getType(format);
          if (format.startsWith('image/')) return readBlobAsDataUrl(blob);
          return blob.text();
        }
      }
    } catch {
      return '';
    }
    return '';
  }

  async function writeFormat(format: string, data: string): Promise<boolean> {
    const cb = getWritableWebClipboard();
    if (cb === null) return false;
    try {
      const blob = await blobFromFormatData(format, data);
      await cb.write([new ClipboardItem({ [format]: blob })]);
      return true;
    } catch {
      return false;
    }
  }

  async function getFormats(): Promise<string[]> {
    const cb = getWebClipboard();
    if (cb === null || typeof cb.read !== 'function') return [];
    try {
      const items = await cb.read();
      const formats: string[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (!formats.includes(type)) formats.push(type);
        }
      }
      return formats;
    } catch {
      return [];
    }
  }

  async function readText(): Promise<string> {
    const cb = getWebClipboard();
    if (cb === null || typeof cb.readText !== 'function') return '';
    try {
      return await cb.readText();
    } catch {
      return '';
    }
  }

  async function writeText(text: string): Promise<boolean> {
    const cb = getWebClipboard();
    if (cb === null || typeof cb.writeText !== 'function') return false;
    try {
      await cb.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function readImage(): Promise<string> {
    const cb = getWebClipboard();
    if (cb === null || typeof cb.read !== 'function') return '';
    try {
      const items = await cb.read();
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith('image/'));
        if (type !== undefined) {
          const blob = await item.getType(type);
          return readBlobAsDataUrl(blob);
        }
      }
    } catch {
      return '';
    }
    return '';
  }

  Object.assign(out, {
    readFormat,
    writeFormat,
    async hasFormat(format: string) {
      const formats = await getFormats();
      return formats.includes(format);
    },
    getFormats,
    async writeItems(items: ReadonlyArray<{ readonly data: string; readonly format: string }>) {
      const cb = getWritableWebClipboard();
      if (cb === null) return false;
      try {
        const entry: Record<string, Blob> = {};
        for (const item of items) entry[item.format] = await blobFromFormatData(item.format, item.data);
        await cb.write([new ClipboardItem(entry)]);
        return true;
      } catch {
        return false;
      }
    },
    async readItems(formats: readonly string[]) {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.read !== 'function') return {};
      try {
        const clipItems = await cb.read();
        const result: Record<string, string> = {};
        for (const clipItem of clipItems) {
          for (const format of formats) {
            if (clipItem.types.includes(format) && !(format in result)) {
              const blob = await clipItem.getType(format);
              result[format] = format.startsWith('image/') ? await readBlobAsDataUrl(blob) : await blob.text();
            }
          }
        }
        return result;
      } catch {
        return {};
      }
    },
    readText,
    writeText,
    async readHtml() {
      return readFormat(ClipboardFormatHtml);
    },
    async writeHtml(html: string) {
      return writeFormat(ClipboardFormatHtml, html);
    },
    async hasText() {
      return (await readText()).length > 0;
    },
    readImage,
    async writeImage(dataUrl: string) {
      const cb = getWritableWebClipboard();
      if (cb === null) return false;
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        await cb.write([new ClipboardItem({ [blob.type]: blob })]);
        return true;
      } catch {
        return false;
      }
    },
    async hasImage() {
      return (await readImage()).length > 0;
    },
    async readRTF() {
      return readFormat(ClipboardFormatRtf);
    },
    async writeRTF(rtf: string) {
      return writeFormat(ClipboardFormatRtf, rtf);
    },
    async clear() {
      return writeText('');
    },
    subscribe(callback: () => void) {
      if (typeof window === 'undefined') return;
      if ('onclipboardchange' in window) {
        window.addEventListener('clipboardchange' as keyof WindowEventMap, callback as EventListener);
      }
    },
    unsubscribe(callback: () => void) {
      if (typeof window === 'undefined' || !('onclipboardchange' in window)) return;
      window.removeEventListener('clipboardchange' as keyof WindowEventMap, callback as EventListener);
    },
  });
}

const createWebClipboardProviderBackend = (): WebClipboardBackend => {
  const _out = allocateEntity<WebClipboardBackend>();
  initializeWebClipboardBackend(_out);
  return finishEntity(_out);
};

export const webClipboardBackend = createWebClipboardProviderBackend();

function getWebClipboard(): Clipboard | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.clipboard ?? null;
}

function getWritableWebClipboard(): Clipboard | null {
  const cb = getWebClipboard();
  if (cb === null || typeof cb.write !== 'function' || typeof ClipboardItem === 'undefined') return null;
  return cb;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    try {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    } catch {
      resolve('');
    }
  });
}
