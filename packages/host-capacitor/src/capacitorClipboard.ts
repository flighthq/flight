import { createEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  ClipboardImageBackend,
  ClipboardTextBackend,
  EntityRuntimeKey,
} from '@flighthq/types/contract';

type CapacitorClipboardBackend = ClipboardImageBackend & ClipboardTextBackend;

// Capacitor covers the text/clear and image clipboard vectors. Other capability slots are
// deliberately absent from its returned host rather than simulated by sentinels.
export function createCapacitorClipboardBackend(capacitor: CapacitorApi): CapacitorClipboardBackend {
  const clipboard = capacitor.clipboard;
  return createEntity({
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
    async clear() {
      // Capacitor has no clear call; overwriting with empty text is the closest honest equivalent.
      try {
        await clipboard.write({ string: '' });
        return true;
      } catch {
        return false;
      }
    },
  } satisfies Omit<CapacitorClipboardBackend, typeof EntityRuntimeKey>);
}
