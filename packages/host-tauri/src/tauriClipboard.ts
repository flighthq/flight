import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostClipboardTextProvider, EntityConstruction, TauriApi } from '@flighthq/types/contract';

// Tauri's clipboard-manager coverage is the text/clear capability vector. Other clipboard
// capability slots are deliberately absent from the Tauri host rather than simulated by sentinels.
export function createTauriClipboardBackend(tauri: TauriApi): HostClipboardTextProvider {
  const out = allocateEntity<HostClipboardTextProvider>();
  initializeTauriClipboardBackend(out, tauri.clipboard);
  return finishEntity(out);
}

export function initializeTauriClipboardBackend(
  out: EntityConstruction<HostClipboardTextProvider>,
  clipboard: TauriApi['clipboard'],
): void {
  out.clear = async () => {
    try {
      await clipboard.clear();
      return true;
    } catch {
      return false;
    }
  };
  out.hasText = async () => {
    try {
      return (await clipboard.readText()).length > 0;
    } catch {
      return false;
    }
  };
  out.readText = async () => {
    try {
      return await clipboard.readText();
    } catch {
      return '';
    }
  };
  out.writeText = async (text) => {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
}
