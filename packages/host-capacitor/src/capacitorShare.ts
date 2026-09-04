import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorShareContentBackend,
  ShareContent,
  EntityConstruction,
} from '@flighthq/types/contract';

export function createCapacitorShareContentBackend(capacitor: CapacitorApi): CapacitorShareContentBackend {
  const out = allocateEntity<CapacitorShareContentBackend>();
  initializeCapacitorShareContentBackend(out, capacitor);
  return finishEntity(out);
}

// Capacitor's provider is present synchronously. Platform rejection is reported by the command
// outcome; construction never starts an async availability probe or caches a transient false value.
export function initializeCapacitorShareContentBackend(
  out: EntityConstruction<CapacitorShareContentBackend>,
  capacitor: CapacitorApi,
): void {
  const share = capacitor.share;
  out.canShareContent = hasShareableContent;
  out.shareContent = async (content, options) => {
    if (!hasShareableContent(content)) return false;
    try {
      await share.share({
        dialogTitle: options?.chooserTitle,
        text: content.text,
        title: content.title,
        url: content.url,
      });
      return true;
    } catch {
      return false;
    }
  };
  out.shareContentWithResult = async (content, options) => {
    if (!hasShareableContent(content)) return { activityType: null, completed: false, dismissed: false };
    try {
      const result = await share.share({
        dialogTitle: options?.chooserTitle,
        text: content.text,
        title: content.title,
        url: content.url,
      });
      return { activityType: result.activityType ?? null, completed: true, dismissed: false };
    } catch {
      return { activityType: null, completed: false, dismissed: true };
    }
  };
}

function hasShareableContent(content: Readonly<ShareContent>): boolean {
  return (
    (content.title !== undefined && content.title !== '') ||
    (content.text !== undefined && content.text !== '') ||
    (content.url !== undefined && content.url !== '')
  );
}
