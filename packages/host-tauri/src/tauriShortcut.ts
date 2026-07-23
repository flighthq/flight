import type { ShortcutBackend, TauriApi } from '@flighthq/types';

// Maps Flight's ShortcutBackend onto Tauri's `@tauri-apps/plugin-global-shortcut`. The seam is
// synchronous (register returns a boolean now) while every Tauri call is async, so the adapter fires
// register/unregister and forgets, optimistically reporting success and mirroring the registered set in
// a local Set — that Set is what getRegistered/isRegistered read (synchronously). Tauri's handler fires
// for both press and release; the adapter filters to 'Pressed' so a keypress delivers one ShortcutEvent.
// Per-accelerator and global enable toggles have no Tauri equivalent, so they report their sentinels.
export function createTauriShortcutBackend(tauri: TauriApi): ShortcutBackend {
  const globalShortcut = tauri.globalShortcut;
  const registered = new Set<string>();
  return {
    getRegistered() {
      return [...registered];
    },
    isRegistered(accelerator) {
      return registered.has(accelerator);
    },
    register(accelerator, listener) {
      // Optimistic: mirror the registration now and fire the async Tauri register; on rejection, drop
      // it from the mirror so getRegistered/isRegistered stay honest.
      registered.add(accelerator);
      globalShortcut
        .register(accelerator, (event) => {
          if (event.state === 'Pressed') listener({ accelerator });
        })
        .catch(() => {
          registered.delete(accelerator);
        });
      return true;
    },
    setAllEnabled() {
      // Tauri has no enable/disable toggle; a caller must unregister/re-register. Reported as a no-op.
    },
    setEnabled() {
      // Tauri has no per-accelerator enable toggle; report unsupported via false.
      return false;
    },
    unregister(accelerator) {
      registered.delete(accelerator);
      globalShortcut.unregister(accelerator).catch(() => {
        /* already unregistered or never registered */
      });
      return true;
    },
    unregisterAll() {
      registered.clear();
      globalShortcut.unregisterAll().catch(() => {
        /* nothing registered */
      });
    },
  };
}
