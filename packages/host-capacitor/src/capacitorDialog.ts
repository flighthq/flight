import type { CapacitorApi, MessageDialogBackend, PromptDialogBackend } from '@flighthq/types/contract';

// Maps Capacitor's alert and confirmation surfaces onto Flight's message-dialog capability. Capacitor
// has no native file picker; consumers leave dialog.file absent instead of advertising sentinels.
export function createCapacitorMessageDialogBackend(capacitor: CapacitorApi): MessageDialogBackend {
  const dialog = capacitor.dialog;
  return {
    async message(options) {
      await dialog.alert({ title: options.title, message: options.message });
      // Capacitor's alert is a single-button acknowledgement; it reports no button choice or checkbox.
      return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
    },
    async confirm(options) {
      const result = await dialog.confirm({ title: options.title, message: options.message });
      return result.value;
    },
  };
}

export function createCapacitorPromptDialogBackend(capacitor: CapacitorApi): PromptDialogBackend {
  const dialog = capacitor.dialog;
  return {
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
