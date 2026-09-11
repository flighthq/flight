import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  HostClipboardCapabilities,
  HostClipboardImageProvider,
  HostClipboardTextProvider,
  EntityConstruction,
} from '@flighthq/types/contract';

type CapacitorClipboardProvider = HostClipboardImageProvider & HostClipboardTextProvider;

// Capacitor covers the text/clear and image clipboard vectors. Other capability slots are
// deliberately absent from its returned host rather than simulated by sentinels.
export function capacitorHostClipboard(
  capacitor: CapacitorApi,
): HostClipboardCapabilities & Required<Pick<HostClipboardCapabilities, 'image' | 'text'>> {
  const provider = capacitorClipboardProvider(capacitor);
  return { image: provider, text: provider };
}

export function capacitorHostClipboardImage(capacitor: CapacitorApi): HostClipboardImageProvider {
  return capacitorClipboardProvider(capacitor);
}

export function capacitorHostClipboardText(capacitor: CapacitorApi): HostClipboardTextProvider {
  return capacitorClipboardProvider(capacitor);
}

function capacitorClipboardProvider(capacitor: CapacitorApi): CapacitorClipboardProvider {
  const out = allocateEntity<CapacitorClipboardProvider>();
  populateCapacitorClipboard(out, capacitor.clipboard);
  return finishEntity(out);
}

function populateCapacitorClipboard(
  out: EntityConstruction<CapacitorClipboardProvider>,
  clipboard: CapacitorApi['clipboard'],
): void {
  // Capacitor has no clear call; overwriting with empty text is the closest honest equivalent.
  out.clear = async () => {
    try {
      await clipboard.write({ string: '' });
      return true;
    } catch {
      return false;
    }
  };
  out.hasImage = async () => {
    try {
      return (await clipboard.read()).type.startsWith('image');
    } catch {
      return false;
    }
  };
  out.hasText = async () => {
    try {
      const result = await clipboard.read();
      return !result.type.startsWith('image') && result.value.length > 0;
    } catch {
      return false;
    }
  };
  out.readImage = async () => {
    try {
      const result = await clipboard.read();
      return result.type.startsWith('image') ? result.value : '';
    } catch {
      return '';
    }
  };
  out.readText = async () => {
    try {
      const result = await clipboard.read();
      return result.type.startsWith('image') ? '' : result.value;
    } catch {
      return '';
    }
  };
  out.writeImage = async (dataUrl) => {
    try {
      await clipboard.write({ image: dataUrl });
      return true;
    } catch {
      return false;
    }
  };
  out.writeText = async (text) => {
    try {
      await clipboard.write({ string: text });
      return true;
    } catch {
      return false;
    }
  };
}
