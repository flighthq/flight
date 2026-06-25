import type { ShortcutEvent } from './ShortcutEvent';

// Global OS hotkey seam. Free functions in @flighthq/shortcut delegate to the active ShortcutBackend
// (web default or a native host's). Web has no global-hotkey capability, so the web backend returns
// false / no-op sentinels rather than throwing — global shortcuts require a native host (Electron/Tauri).
export interface ShortcutBackend {
  getRegistered(): readonly string[];
  isRegistered(accelerator: string): boolean;
  register(accelerator: string, listener: (event: Readonly<ShortcutEvent>) => void): boolean;
  setAllEnabled(enabled: boolean): void;
  setEnabled(accelerator: string, enabled: boolean): boolean;
  unregister(accelerator: string): boolean;
  unregisterAll(): void;
}
