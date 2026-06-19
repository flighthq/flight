// Global OS hotkey seam. Free functions in @flighthq/shortcut delegate to the active ShortcutBackend
// (web default or a native host's). Web has no global-hotkey capability, so the web backend returns
// false / no-op sentinels rather than throwing — global shortcuts require a native host (Electron/Tauri).
export interface ShortcutBackend {
  register(accelerator: string, listener: () => void): boolean;
  unregister(accelerator: string): boolean;
  unregisterAll(): void;
  isRegistered(accelerator: string): boolean;
}
