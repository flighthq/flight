import type { ClipboardBackend, TauriApi } from '@flighthq/types';

// Maps Flight's ClipboardBackend onto Tauri's async `@tauri-apps/plugin-clipboard-manager`. Both sides
// are Promise-based, so text and clear map directly. Tauri's clipboard has no HTML/RTF/bookmark read,
// no arbitrary MIME flavors, no file list, no change counter, and crosses images as an `Image` object
// rather than a data URL — those methods therefore report the contract's sentinels ('' / false / null /
// [] / -1) rather than a fabricated result. Reads resolve to sentinels on failure instead of throwing.
export function createTauriClipboardBackend(tauri: TauriApi): ClipboardBackend {
  const clipboard = tauri.clipboard;
  return {
    async readText() {
      try {
        return await clipboard.readText();
      } catch {
        return '';
      }
    },
    async writeText(text) {
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    async readHtml() {
      // Tauri's clipboard exposes no HTML read; report the empty sentinel.
      return '';
    },
    async writeHtml() {
      // Tauri's clipboard exposes no HTML write; report unsupported.
      return false;
    },
    async hasText() {
      try {
        return (await clipboard.readText()).length > 0;
      } catch {
        return false;
      }
    },
    async readImage() {
      // Tauri crosses clipboard images as an `Image` object, not a data URL; report none.
      return '';
    },
    async writeImage() {
      // Writing a data URL is not expressible through Tauri's `Image`-typed clipboard write here.
      return false;
    },
    async hasImage() {
      return false;
    },
    async readRTF() {
      return '';
    },
    async writeRTF() {
      return false;
    },
    async readBookmark() {
      return null;
    },
    async writeBookmark() {
      return false;
    },
    async readFormat() {
      return '';
    },
    async writeFormat() {
      return false;
    },
    async hasFormat() {
      return false;
    },
    async getFormats() {
      return [];
    },
    async readItems() {
      return {};
    },
    async writeItems() {
      return false;
    },
    async readFiles() {
      return [];
    },
    async writeFiles() {
      return false;
    },
    async clear() {
      try {
        await clipboard.clear();
        return true;
      } catch {
        return false;
      }
    },
    getChangeCount() {
      // Tauri exposes no clipboard change counter; -1 sentinel per the contract.
      return -1;
    },
    subscribeClipboardChange() {
      // Tauri emits no clipboard-change event; inert unsubscribe.
      return () => {};
    },
  };
}
