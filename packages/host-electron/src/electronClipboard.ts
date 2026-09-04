import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ClipboardBookmark,
  ClipboardBookmarkBackend,
  ClipboardFormatsBackend,
  ClipboardImageBackend,
  ClipboardTextBackend,
  ElectronApi,
  ElectronClipboardData,
  EntityConstruction,
} from '@flighthq/types/contract';

type ElectronClipboardBackend = ClipboardBookmarkBackend &
  ClipboardFormatsBackend &
  ClipboardImageBackend &
  ClipboardTextBackend;

// Maps Flight's clipboard capabilities onto Electron's synchronous clipboard module, adapting to
// the async Promise contracts. Images cross the seam as data URLs (Flight's convention), converted
// via nativeImage. Reads resolve to sentinels ('' / null / false) on failure rather than throwing.
export function createElectronClipboardBackend(electron: ElectronApi): ElectronClipboardBackend {
  const cb = electron.clipboard;
  const out = allocateEntity<ElectronClipboardBackend>();
  initializeElectronClipboardBackend(out, cb, electron);
  return finishEntity(out);
}

export function initializeElectronClipboardBackend(
  out: EntityConstruction<ElectronClipboardBackend>,
  cb: ElectronApi['clipboard'],
  electron: ElectronApi,
): void {
  out.clear = async () => {
    try {
      cb.clear();
      return true;
    } catch {
      return false;
    }
  };
  out.getFormats = async () => {
    try {
      return cb.availableFormats();
    } catch {
      return [];
    }
  };
  out.hasFormat = async (format) => {
    try {
      return cb.has(format);
    } catch {
      return false;
    }
  };
  out.hasImage = async () => {
    try {
      return !cb.readImage().isEmpty();
    } catch {
      return false;
    }
  };
  out.hasText = async () => {
    try {
      return cb.readText().length > 0;
    } catch {
      return false;
    }
  };
  out.readBookmark = async () => {
    try {
      const bookmark = cb.readBookmark();
      if (bookmark.title === '' && bookmark.url === '') return null;
      const result: ClipboardBookmark = { title: bookmark.title, url: bookmark.url };
      return result;
    } catch {
      return null;
    }
  };
  out.readFormat = async (format) => {
    try {
      return cb.read(format);
    } catch {
      return '';
    }
  };
  out.readHtml = async () => {
    try {
      return cb.readHTML();
    } catch {
      return '';
    }
  };
  out.readImage = async () => {
    try {
      const image = cb.readImage();
      return image.isEmpty() ? '' : image.toDataURL();
    } catch {
      return '';
    }
  };
  out.readItems = async (formats) => {
    const items: Record<string, string> = {};
    for (const format of formats) {
      try {
        if (cb.has(format)) items[format] = cb.read(format);
      } catch {
        /* skip a format that cannot be read */
      }
    }
    return items;
  };
  out.readRTF = async () => {
    try {
      return cb.readRTF();
    } catch {
      return '';
    }
  };
  out.readText = async () => {
    try {
      return cb.readText();
    } catch {
      return '';
    }
  };
  out.writeBookmark = async (title, url) => {
    try {
      cb.writeBookmark(title, url);
      return true;
    } catch {
      return false;
    }
  };
  out.writeFormat = async (format, data) => {
    try {
      const payload: ElectronClipboardData = {};
      payload[formatKey(format)] = data;
      cb.write(payload);
      return true;
    } catch {
      return false;
    }
  };
  out.writeHtml = async (html) => {
    try {
      cb.writeHTML(html);
      return true;
    } catch {
      return false;
    }
  };
  out.writeImage = async (dataUrl) => {
    try {
      cb.writeImage(electron.nativeImage.createFromDataURL(dataUrl));
      return true;
    } catch {
      return false;
    }
  };
  out.writeItems = async (items) => {
    try {
      const data: ElectronClipboardData = {};
      for (const item of items) data[formatKey(item.format)] = item.data;
      cb.write(data);
      return true;
    } catch {
      return false;
    }
  };
  out.writeRTF = async (rtf) => {
    try {
      cb.writeRTF(rtf);
      return true;
    } catch {
      return false;
    }
  };
  out.writeText = async (text) => {
    try {
      cb.writeText(text);
      return true;
    } catch {
      return false;
    }
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
