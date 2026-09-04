import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  MessageDialogBackend,
  PromptDialogBackend,
  EntityConstruction,
} from '@flighthq/types/contract';

export function createCapacitorMessageDialogBackend(capacitor: CapacitorApi): MessageDialogBackend {
  const out = allocateEntity<MessageDialogBackend>();
  initializeCapacitorMessageDialogBackend(out, capacitor);
  return finishEntity(out);
}

export function createCapacitorPromptDialogBackend(capacitor: CapacitorApi): PromptDialogBackend {
  const out = allocateEntity<PromptDialogBackend>();
  initializeCapacitorPromptDialogBackend(out, capacitor);
  return finishEntity(out);
}

// Maps Capacitor's alert and confirmation surfaces onto Flight's message-dialog capability. Capacitor
// has no native file picker; consumers leave the three file-dialog slots absent instead of advertising sentinels.
export function initializeCapacitorMessageDialogBackend(
  out: EntityConstruction<MessageDialogBackend>,
  capacitor: CapacitorApi,
): void {
  const dialog = capacitor.dialog;
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
}

export function initializeCapacitorPromptDialogBackend(
  out: EntityConstruction<PromptDialogBackend>,
  capacitor: CapacitorApi,
): void {
  const dialog = capacitor.dialog;
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
}
