import type { ClipboardBackend, ClipboardBookmark } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

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
    async readHTML() {
      try {
        return cb.readHTML();
      } catch {
        return '';
      }
    },
    async writeHTML(html) {
      try {
        cb.writeHTML(html);
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
        return image.isEmpty() ? '' : image.toDataURL();
      } catch {
        return '';
      }
    },
    async writeImage(dataURL) {
      try {
        cb.writeImage(electron.nativeImage.createFromDataURL(dataURL));
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
