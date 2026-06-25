import { createSignal, emitSignal } from '@flighthq/signals';
import type { ClipboardBackend, ClipboardBookmark, ClipboardWatch, ClipboardWriteItem } from '@flighthq/types';

// Attaches `watch` to the active backend's change subscription. Emits watch.onChange on each
// clipboard change. Idempotent: a prior subscription is torn down first.
// Pair with detachClipboardWatch / disposeClipboardWatch.
export function attachClipboardWatch(watch: ClipboardWatch): void {
  detachClipboardWatch(watch);
  const unsubscribe = getClipboardBackend().subscribeClipboardChange(() => {
    emitSignal(watch.onChange);
  });
  _watchSubscriptions.set(watch, unsubscribe);
}

// Clears the system clipboard. Returns false when the host denies access. Sentinel, not throw.
export function clearClipboard(): Promise<boolean> {
  return getClipboardBackend().clear();
}

// Allocates a ClipboardWatch event entity with an inert signal.
// Call attachClipboardWatch to start delivery; call disposeClipboardWatch when done.
export function createClipboardWatch(): ClipboardWatch {
  return { onChange: createSignal() };
}

// Builds the default web backend over navigator.clipboard. Reads return '' / false / [] when the API
// is absent (non-secure context, jsdom) or the user denies permission.
export function createWebClipboardBackend(): ClipboardBackend {
  return {
    async readFormat(format) {
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
    },
    async writeFormat(format, data) {
      const cb = getWritableWebClipboard();
      if (cb === null) return false;
      try {
        const blob = await blobFromFormatData(format, data);
        await cb.write([new ClipboardItem({ [format]: blob })]);
        return true;
      } catch {
        return false;
      }
    },
    async hasFormat(format) {
      const formats = await this.getFormats();
      return formats.includes(format);
    },
    async getFormats() {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.read !== 'function') return [];
      try {
        const items = await cb.read();
        const out: string[] = [];
        for (const item of items) {
          for (const t of item.types) {
            if (!out.includes(t)) out.push(t);
          }
        }
        return out;
      } catch {
        return [];
      }
    },
    async writeItems(items) {
      const cb = getWritableWebClipboard();
      if (cb === null) return false;
      try {
        const entry: Record<string, Blob> = {};
        for (const item of items) {
          entry[item.format] = await blobFromFormatData(item.format, item.data);
        }
        await cb.write([new ClipboardItem(entry)]);
        return true;
      } catch {
        return false;
      }
    },
    async readItems(formats) {
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
    async readText() {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.readText !== 'function') return '';
      try {
        return await cb.readText();
      } catch {
        return '';
      }
    },
    async writeText(text) {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.writeText !== 'function') return false;
      try {
        await cb.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    async readHtml() {
      return this.readFormat('text/html');
    },
    async writeHtml(html) {
      return this.writeFormat('text/html', html);
    },
    async hasText() {
      return (await this.readText()).length > 0;
    },
    async readImage() {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.read !== 'function') return '';
      try {
        const items = await cb.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (type !== undefined) {
            const blob = await item.getType(type);
            return readBlobAsDataUrl(blob);
          }
        }
      } catch {
        return '';
      }
      return '';
    },
    async writeImage(dataUrl) {
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
      return (await this.readImage()).length > 0;
    },
    async readRTF() {
      return this.readFormat('text/rtf');
    },
    async writeRTF(rtf) {
      return this.writeFormat('text/rtf', rtf);
    },
    // The web platform exposes no clipboard bookmark format; a native host is required to read one.
    async readBookmark() {
      return null;
    },
    // The web platform exposes no clipboard bookmark format; a native host is required to write one.
    async writeBookmark() {
      return false;
    },
    // The web platform exposes no file-path clipboard format; a native host is required.
    async readFiles() {
      return [];
    },
    // The web platform exposes no file-path clipboard format; a native host is required.
    async writeFiles() {
      return false;
    },
    async clear() {
      return this.writeText('');
    },
    getChangeCount() {
      return -1;
    },
    subscribeClipboardChange(listener) {
      if (typeof window === 'undefined') return () => {};
      // Use the experimental 'clipboardchange' event where present; fall back to no-op.
      const target = window as Window & { onclipboardchange?: unknown };
      if (
        'onclipboardchange' in target ||
        typeof (window as unknown as Record<string, unknown>)['clipboardchange'] !== 'undefined'
      ) {
        const handler = () => listener();
        window.addEventListener('clipboardchange' as keyof WindowEventMap, handler as EventListener);
        return () => window.removeEventListener('clipboardchange' as keyof WindowEventMap, handler as EventListener);
      }
      return () => {};
    },
  };
}

// Stops delivery to `watch` and forgets its subscription. Safe to call when not attached.
export function detachClipboardWatch(watch: ClipboardWatch): void {
  const unsubscribe = _watchSubscriptions.get(watch);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _watchSubscriptions.delete(watch);
  }
}

// Detaches `watch`'s backend subscription and releases it for garbage collection.
// The signal remains plain GC-managed memory afterward.
export function disposeClipboardWatch(watch: ClipboardWatch): void {
  detachClipboardWatch(watch);
}

// The active clipboard backend, or a lazily-created web default. There is always a backend.
export function getClipboardBackend(): ClipboardBackend {
  if (_backend === null) _backend = createWebClipboardBackend();
  return _backend;
}

// Returns a monotonically increasing count from the active backend, or -1 if unsupported.
export function getClipboardChangeCount(): number {
  return getClipboardBackend().getChangeCount();
}

// Returns the list of MIME/format strings currently on the clipboard. [] sentinel on access denied.
export function getClipboardFormats(): Promise<readonly string[]> {
  return getClipboardBackend().getFormats();
}

// True when the clipboard currently holds a bookmark. Returns false when access is denied.
export function hasClipboardBookmark(): Promise<boolean> {
  return getClipboardBackend().hasFormat('text/x-moz-url');
}

// True when the given MIME/format string is currently present on the clipboard.
export function hasClipboardFormat(format: string): Promise<boolean> {
  return getClipboardBackend().hasFormat(format);
}

// True when the clipboard currently holds HTML content. Returns false when access is denied.
export function hasClipboardHtml(): Promise<boolean> {
  return getClipboardBackend().hasFormat('text/html');
}

// True when the clipboard currently holds an image. Returns false when access is denied.
export function hasClipboardImage(): Promise<boolean> {
  return getClipboardBackend().hasImage();
}

// True when the clipboard currently holds RTF content. Returns false when access is denied.
export function hasClipboardRTF(): Promise<boolean> {
  return getClipboardBackend().hasFormat('text/rtf');
}

// True when the clipboard currently holds non-empty text. Returns false when access is denied.
export function hasClipboardText(): Promise<boolean> {
  return getClipboardBackend().hasText();
}

// Reads multiple formats in one round-trip; missing formats are omitted from the result.
export function readClipboard(formats: readonly string[]): Promise<Readonly<Record<string, string>>> {
  return getClipboardBackend().readItems(formats);
}

// Reads a bookmark (title + URL) from the clipboard, or null when none is present or access is denied.
export function readClipboardBookmark(): Promise<ClipboardBookmark | null> {
  return getClipboardBackend().readBookmark();
}

// Reads the file paths currently on the clipboard. Returns [] when none are present or on web.
export function readClipboardFiles(): Promise<readonly string[]> {
  return getClipboardBackend().readFiles();
}

// Reads an arbitrary MIME/format flavor as a string; returns '' when absent or access is denied.
export function readClipboardFormat(format: string): Promise<string> {
  return getClipboardBackend().readFormat(format);
}

// Reads HTML from the clipboard, or '' when none is present or access is denied.
export function readClipboardHtml(): Promise<string> {
  return getClipboardBackend().readHtml();
}

// Reads an image from the clipboard as a data URL, or '' when none is present or access is denied.
export function readClipboardImage(): Promise<string> {
  return getClipboardBackend().readImage();
}

// Reads RTF (Rich Text Format) markup from the clipboard, or '' when none is present or access is denied.
export function readClipboardRTF(): Promise<string> {
  return getClipboardBackend().readRTF();
}

// Reads plain text from the clipboard, or '' when empty or access is denied.
export function readClipboardText(): Promise<string> {
  return getClipboardBackend().readText();
}

// Installs a native host clipboard backend; pass null to fall back to the web default.
export function setClipboardBackend(backend: ClipboardBackend | null): void {
  _backend = backend;
}

// Writes multiple formats atomically so a paste target picks its best representation.
export function writeClipboard(items: readonly Readonly<ClipboardWriteItem>[]): Promise<boolean> {
  return getClipboardBackend().writeItems(items);
}

// Writes a bookmark (title + URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardBookmark(title: string, url: string): Promise<boolean> {
  return getClipboardBackend().writeBookmark(title, url);
}

// Writes file paths to the clipboard. Returns false when the host denies access or on web.
export function writeClipboardFiles(paths: readonly string[]): Promise<boolean> {
  return getClipboardBackend().writeFiles(paths);
}

// Writes an arbitrary MIME/format flavor. Returns false when the host denies access.
export function writeClipboardFormat(format: string, data: string): Promise<boolean> {
  return getClipboardBackend().writeFormat(format, data);
}

// Writes HTML to the clipboard. Returns false when the host denies access.
export function writeClipboardHtml(html: string): Promise<boolean> {
  return getClipboardBackend().writeHtml(html);
}

// Writes an image (given as a data URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardImage(dataUrl: string): Promise<boolean> {
  return getClipboardBackend().writeImage(dataUrl);
}

// Writes RTF (Rich Text Format) markup to the clipboard. Returns false when the host denies access.
export function writeClipboardRTF(rtf: string): Promise<boolean> {
  return getClipboardBackend().writeRTF(rtf);
}

// Writes plain text to the clipboard. Returns false when the host denies access.
export function writeClipboardText(text: string): Promise<boolean> {
  return getClipboardBackend().writeText(text);
}

let _backend: ClipboardBackend | null = null;
const _watchSubscriptions = new WeakMap<ClipboardWatch, () => void>();

// Converts a format/data pair into a Blob. Image data URLs are fetched into their decoded bytes;
// every other flavor wraps the string payload directly under its MIME type.
async function blobFromFormatData(format: string, data: string): Promise<Blob> {
  if (format.startsWith('image/') && data.startsWith('data:')) {
    const response = await fetch(data);
    return response.blob();
  }
  return new Blob([data], { type: format });
}

function getWebClipboard(): Clipboard | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.clipboard ?? null;
}

// The web clipboard when ClipboardItem writes are possible, or null. Centralizes the shared
// write-path guard so every write/writeItems/writeImage caller folds to one null check.
function getWritableWebClipboard(): Clipboard | null {
  const cb = getWebClipboard();
  if (cb === null || typeof cb.write !== 'function' || typeof ClipboardItem === 'undefined') return null;
  return cb;
}

// Reads a Blob into a data URL via FileReader, resolving '' when reading fails.
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
