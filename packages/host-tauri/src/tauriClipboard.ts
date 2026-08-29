import { createEntity } from '@flighthq/entity/contract';
import type { ClipboardTextBackend, EntityRuntimeKey, TauriApi } from '@flighthq/types/contract';

// Tauri's clipboard-manager coverage is the text/clear capability vector. Other clipboard
// capability slots are deliberately absent from the Tauri host rather than simulated by sentinels.
export function createTauriClipboardBackend(tauri: TauriApi): ClipboardTextBackend {
  const clipboard = tauri.clipboard;
  return createEntity({
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
    async hasText() {
      try {
        return (await clipboard.readText()).length > 0;
      } catch {
        return false;
      }
    },
    async clear() {
      try {
        await clipboard.clear();
        return true;
      } catch {
        return false;
      }
    },
  } satisfies Omit<ClipboardTextBackend, typeof EntityRuntimeKey>);
}
