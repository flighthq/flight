import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostClipboardCapabilities, HostClipboardTextProvider, TauriApi } from '@flighthq/types/contract';

export function tauriHostClipboard(
  tauri: TauriApi,
): HostClipboardCapabilities & Required<Pick<HostClipboardCapabilities, 'text'>> {
  return { text: tauriHostClipboardText(tauri) };
}

// Tauri's clipboard-manager coverage is the text/clear capability vector. Other clipboard
// capability slots are deliberately absent from the Tauri host rather than simulated by sentinels.
export function tauriHostClipboardText(tauri: TauriApi): HostClipboardTextProvider {
  const clipboard = tauri.clipboard;
  const provider = allocateEntity<HostClipboardTextProvider>();
  provider.clear = async () => {
    try {
      await clipboard.clear();
      return true;
    } catch {
      return false;
    }
  };
  provider.hasText = async () => {
    try {
      return (await clipboard.readText()).length > 0;
    } catch {
      return false;
    }
  };
  provider.readText = async () => {
    try {
      return await clipboard.readText();
    } catch {
      return '';
    }
  };
  provider.writeText = async (text) => {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
  return finishEntity(provider);
}
