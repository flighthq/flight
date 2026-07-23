import type { DialogBackend, CapacitorApi } from '@flighthq/types';

// Maps Flight's DialogBackend onto Capacitor's async `@capacitor/dialog`. `message` maps to `alert`, a
// single-button acknowledgement (so it resolves buttonIndex 0 / not-cancelled / no checkbox); `confirm`
// maps to `confirm`; `prompt` maps to `prompt`, resolving the entered text or the null sentinel on
// cancel. Capacitor Dialog has no native file picker, so openFile/openDirectory resolve [] and saveFile
// resolves null — those belong to a filesystem/document-picker plugin, not Dialog.
export function createCapacitorDialogBackend(capacitor: CapacitorApi): DialogBackend {
  const dialog = capacitor.dialog;
  return {
    async openFile() {
      // Capacitor Dialog has no file picker; report none.
      return [];
    },
    async openDirectory() {
      return [];
    },
    async saveFile() {
      return null;
    },
    async message(options) {
      await dialog.alert({ title: options.title, message: options.message });
      // Capacitor's alert is a single-button acknowledgement; it reports no button choice or checkbox.
      return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
    },
    async confirm(options) {
      const result = await dialog.confirm({ title: options.title, message: options.message });
      return result.value;
    },
    async prompt(options) {
      const result = await dialog.prompt({
        title: options.title,
        message: options.message,
        inputText: options.defaultValue,
        inputPlaceholder: options.placeholder,
      });
      return result.cancelled ? null : result.value;
    },
  };
}
