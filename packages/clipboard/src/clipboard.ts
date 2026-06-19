import type { ClipboardBackend, ClipboardBookmark } from '@flighthq/types';

// Clears the system clipboard. Returns false when the host denies access. Sentinel, not throw.
export function clearClipboard(): Promise<boolean> {
  return getClipboardBackend().clear();
}

// Builds the default web backend over navigator.clipboard. Reads return '' / false when the API is
// absent (non-secure context, jsdom) or the user denies permission — clipboard access is not guaranteed.
export function createWebClipboardBackend(): ClipboardBackend {
  return {
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
    async readHTML() {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.read !== 'function') return '';
      try {
        const items = await cb.read();
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html');
            return await blob.text();
          }
        }
      } catch {
        return '';
      }
      return '';
    },
    async writeHTML(html) {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.write !== 'function' || typeof ClipboardItem === 'undefined') return false;
      try {
        const blob = new Blob([html], { type: 'text/html' });
        await cb.write([new ClipboardItem({ 'text/html': blob })]);
        return true;
      } catch {
        return false;
      }
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
            return await readBlobAsDataURL(blob);
          }
        }
      } catch {
        return '';
      }
      return '';
    },
    async writeImage(dataURL) {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.write !== 'function' || typeof ClipboardItem === 'undefined') return false;
      try {
        const response = await fetch(dataURL);
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
      const cb = getWebClipboard();
      if (cb === null || typeof cb.read !== 'function') return '';
      try {
        const items = await cb.read();
        for (const item of items) {
          if (item.types.includes('text/rtf')) {
            const blob = await item.getType('text/rtf');
            return await blob.text();
          }
        }
      } catch {
        return '';
      }
      return '';
    },
    async writeRTF(rtf) {
      const cb = getWebClipboard();
      if (cb === null || typeof cb.write !== 'function' || typeof ClipboardItem === 'undefined') return false;
      try {
        const blob = new Blob([rtf], { type: 'text/rtf' });
        await cb.write([new ClipboardItem({ 'text/rtf': blob })]);
        return true;
      } catch {
        return false;
      }
    },
    // The web platform exposes no clipboard bookmark format; a native host is required to read one.
    async readBookmark() {
      return null;
    },
    // The web platform exposes no clipboard bookmark format; a native host is required to write one.
    async writeBookmark() {
      return false;
    },
    async clear() {
      return this.writeText('');
    },
  };
}

// The active clipboard backend, or a lazily-created web default. There is always a backend.
export function getClipboardBackend(): ClipboardBackend {
  if (_backend === null) _backend = createWebClipboardBackend();
  return _backend;
}

// True when the clipboard currently holds an image. Returns false when access is denied.
export function hasClipboardImage(): Promise<boolean> {
  return getClipboardBackend().hasImage();
}

// True when the clipboard currently holds non-empty text. Returns false when access is denied.
export function hasClipboardText(): Promise<boolean> {
  return getClipboardBackend().hasText();
}

// Reads a bookmark (title + URL) from the clipboard, or null when none is present or access is denied.
export function readClipboardBookmark(): Promise<ClipboardBookmark | null> {
  return getClipboardBackend().readBookmark();
}

// Reads HTML from the clipboard, or '' when none is present or access is denied.
export function readClipboardHTML(): Promise<string> {
  return getClipboardBackend().readHTML();
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

// Writes a bookmark (title + URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardBookmark(title: string, url: string): Promise<boolean> {
  return getClipboardBackend().writeBookmark(title, url);
}

// Writes HTML to the clipboard. Returns false when the host denies access.
export function writeClipboardHTML(html: string): Promise<boolean> {
  return getClipboardBackend().writeHTML(html);
}

// Writes an image (given as a data URL) to the clipboard. Returns false when the host denies access.
export function writeClipboardImage(dataURL: string): Promise<boolean> {
  return getClipboardBackend().writeImage(dataURL);
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

function getWebClipboard(): Clipboard | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.clipboard ?? null;
}

// Reads a Blob into a data URL via FileReader, resolving '' when reading fails.
function readBlobAsDataURL(blob: Blob): Promise<string> {
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
