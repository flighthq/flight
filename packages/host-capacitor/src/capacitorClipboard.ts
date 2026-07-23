import type { ClipboardBackend, CapacitorApi } from '@flighthq/types';

// Maps Flight's ClipboardBackend onto Capacitor's async `@capacitor/clipboard`. Text round-trips through
// read/write; an image crosses as a data URL (Capacitor's `read` reports an `image/*` type, `write`
// takes an `image` data URL), so readImage/writeImage/hasImage map too. Capacitor's clipboard has no
// HTML/RTF/bookmark read, no arbitrary MIME flavors, no file list, and no change counter — those methods
// report the contract's sentinels ('' / false / null / [] / -1). Reads resolve to sentinels on failure
// instead of throwing.
export function createCapacitorClipboardBackend(capacitor: CapacitorApi): ClipboardBackend {
  const clipboard = capacitor.clipboard;
  return {
    async readText() {
      try {
        const result = await clipboard.read();
        return result.type.startsWith('image') ? '' : result.value;
      } catch {
        return '';
      }
    },
    async writeText(text) {
      try {
        await clipboard.write({ string: text });
        return true;
      } catch {
        return false;
      }
    },
    async readHtml() {
      // Capacitor's clipboard exposes no HTML read; report the empty sentinel.
      return '';
    },
    async writeHtml() {
      // Capacitor's clipboard exposes no HTML write; report unsupported.
      return false;
    },
    async hasText() {
      try {
        const result = await clipboard.read();
        return !result.type.startsWith('image') && result.value.length > 0;
      } catch {
        return false;
      }
    },
    async readImage() {
      try {
        const result = await clipboard.read();
        return result.type.startsWith('image') ? result.value : '';
      } catch {
        return '';
      }
    },
    async writeImage(dataUrl) {
      try {
        await clipboard.write({ image: dataUrl });
        return true;
      } catch {
        return false;
      }
    },
    async hasImage() {
      try {
        return (await clipboard.read()).type.startsWith('image');
      } catch {
        return false;
      }
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
      // Capacitor has no clipboard clear; overwrite with empty text as the closest honest equivalent.
      try {
        await clipboard.write({ string: '' });
        return true;
      } catch {
        return false;
      }
    },
    getChangeCount() {
      // Capacitor exposes no clipboard change counter; -1 sentinel per the contract.
      return -1;
    },
    subscribeClipboardChange() {
      // Capacitor emits no clipboard-change event; inert unsubscribe.
      return () => {};
    },
  };
}
