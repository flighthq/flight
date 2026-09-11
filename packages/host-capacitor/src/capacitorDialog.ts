import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  HostDialogCapabilities,
  HostMessageDialogProvider,
  HostPromptDialogProvider,
  EntityConstruction,
} from '@flighthq/types/contract';

export function capacitorHostDialog(
  capacitor: CapacitorApi,
): HostDialogCapabilities & Required<Pick<HostDialogCapabilities, 'message' | 'prompt'>> {
  return {
    message: capacitorHostMessageDialog(capacitor),
    prompt: capacitorHostPromptDialog(capacitor),
  };
}

export function capacitorHostMessageDialog(capacitor: CapacitorApi): HostMessageDialogProvider {
  const out = allocateEntity<HostMessageDialogProvider>();
  populateCapacitorMessageDialog(out, capacitor);
  return finishEntity(out);
}

export function capacitorHostPromptDialog(capacitor: CapacitorApi): HostPromptDialogProvider {
  const out = allocateEntity<HostPromptDialogProvider>();
  populateCapacitorPromptDialog(out, capacitor);
  return finishEntity(out);
}

// Maps Capacitor's alert and confirmation surfaces onto Flight's message-dialog capability. Capacitor
// has no native file picker; consumers leave the three file-dialog slots absent instead of advertising sentinels.
function populateCapacitorMessageDialog(
  out: EntityConstruction<HostMessageDialogProvider>,
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

function populateCapacitorPromptDialog(
  out: EntityConstruction<HostPromptDialogProvider>,
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
