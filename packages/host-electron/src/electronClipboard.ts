import type { ClipboardBackend, ClipboardBookmark } from '@flighthq/types';

import type { ElectronApi, ElectronClipboardData } from './electronModule';

// Maps Flight's ClipboardBackend onto Electron's synchronous clipboard module, adapting to the
// async Promise contract. Images cross the seam as data URLs (Flight's convention), converted via
// nativeImage. Reads resolve to sentinels ('' / null / false) on failure rather than throwing.
export function createElectronClipboardBackend(electron: ElectronApi): ClipboardBackend {
  const cb = electron.clipboard;
  return {
    async readText() {
      try {
        return cb.readText();
      } catch {
        return '';
      }
    },
    async writeText(text) {
      try {
        cb.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    async readHtml() {
      try {
        return cb.readHtml();
      } catch {
        return '';
      }
    },
    async writeHtml(html) {
      try {
        cb.writeHtml(html);
        return true;
      } catch {
        return false;
      }
    },
    async hasText() {
      try {
        return cb.readText().length > 0;
      } catch {
        return false;
      }
    },
    async readImage() {
      try {
        const image = cb.readImage();
        return image.isEmpty() ? '' : image.toDataUrl();
      } catch {
        return '';
      }
    },
    async writeImage(dataUrl) {
      try {
        cb.writeImage(electron.nativeImage.createFromDataUrl(dataUrl));
        return true;
      } catch {
        return false;
      }
    },
    async hasImage() {
      try {
        return !cb.readImage().isEmpty();
      } catch {
        return false;
      }
    },
    async readRTF() {
      try {
        return cb.readRTF();
      } catch {
        return '';
      }
    },
    async writeRTF(rtf) {
      try {
        cb.writeRTF(rtf);
        return true;
      } catch {
        return false;
      }
    },
    async readBookmark() {
      try {
        const bookmark = cb.readBookmark();
        if (bookmark.title === '' && bookmark.url === '') return null;
        const out: ClipboardBookmark = { title: bookmark.title, url: bookmark.url };
        return out;
      } catch {
        return null;
      }
    },
    async writeBookmark(title, url) {
      try {
        cb.writeBookmark(title, url);
        return true;
      } catch {
        return false;
      }
    },
    async readFormat(format) {
      try {
        return cb.read(format);
      } catch {
        return '';
      }
    },
    async writeFormat(format, data) {
      try {
        const payload: ElectronClipboardData = {};
        payload[formatKey(format)] = data;
        cb.write(payload);
        return true;
      } catch {
        return false;
      }
    },
    async hasFormat(format) {
      try {
        return cb.has(format);
      } catch {
        return false;
      }
    },
    async getFormats() {
      try {
        return cb.availableFormats();
      } catch {
        return [];
      }
    },
    async readItems(formats) {
      const out: Record<string, string> = {};
      for (const format of formats) {
        try {
          if (cb.has(format)) out[format] = cb.read(format);
        } catch {
          /* skip a format that cannot be read */
        }
      }
      return out;
    },
    async writeItems(items) {
      try {
        const data: ElectronClipboardData = {};
        for (const item of items) data[formatKey(item.format)] = item.data;
        cb.write(data);
        return true;
      } catch {
        return false;
      }
    },
    async readFiles() {
      // Electron's clipboard has no first-class file-list flavor; report none.
      return [];
    },
    async writeFiles() {
      // Electron's clipboard has no first-class file-list flavor; report unsupported.
      return false;
    },
    getChangeCount() {
      // Electron does not expose a clipboard change counter; -1 sentinel per the contract.
      return -1;
    },
    subscribeClipboardChange() {
      // Electron emits no clipboard-change event; inert unsubscribe.
      return () => {};
    },
    async clear() {
      try {
        cb.clear();
        return true;
      } catch {
        return false;
      }
    },
  };
}

// Maps a MIME/flavor string to the keyed field Electron's clipboard.write accepts. Unknown flavors
// fall back to the plain-text slot.
function formatKey(format: string): 'text' | 'html' | 'rtf' | 'bookmark' {
  if (format === 'text/html' || format === 'html') return 'html';
  if (format === 'text/rtf' || format === 'application/rtf' || format === 'rtf') return 'rtf';
  if (format === 'bookmark') return 'bookmark';
  return 'text';
}
