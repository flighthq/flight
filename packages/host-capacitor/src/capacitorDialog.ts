import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CapacitorApi, MessageDialogBackend, PromptDialogBackend } from '@flighthq/types/contract';

// Maps Capacitor's alert and confirmation surfaces onto Flight's message-dialog capability. Capacitor
// has no native file picker; consumers leave the three file-dialog slots absent instead of advertising sentinels.
export function createCapacitorMessageDialogBackend(capacitor: CapacitorApi): MessageDialogBackend {
  const dialog = capacitor.dialog;
  const out = allocateEntity<MessageDialogBackend>();
  out.message = async (options) => {
    if (options.signal?.aborted) {
      return {
        buttonIndex: options.cancelId ?? 0,
        cancelled: true,
        checkboxChecked: options.checkboxChecked ?? false,
      };
    }
    await dialog.alert({ title: options.title, message: options.message });
    // Capacitor's alert is a single-button acknowledgement; it reports no button choice or checkbox.
    return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
  };
  out.confirm = async (options) => {
    if (options.signal?.aborted) return false;
    const result = await dialog.confirm({ title: options.title, message: options.message });
    return result.value;
  };
  return finishEntity(out);
}

export function createCapacitorPromptDialogBackend(capacitor: CapacitorApi): PromptDialogBackend {
  const dialog = capacitor.dialog;
  const out = allocateEntity<PromptDialogBackend>();
  out.prompt = async (options) => {
    if (options.signal?.aborted) return null;
    const result = await dialog.prompt({
      title: options.title,
      message: options.message,
      inputText: options.defaultValue,
      inputPlaceholder: options.placeholder,
    });
    return result.cancelled ? null : result.value;
  };
  return finishEntity(out);
}
