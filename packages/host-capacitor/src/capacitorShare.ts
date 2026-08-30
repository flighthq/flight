import { createEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorShareContentBackend,
  EntityRuntimeKey,
  ShareContent,
} from '@flighthq/types/contract';

// Capacitor's provider is present synchronously. Platform rejection is reported by the command
// outcome; construction never starts an async availability probe or caches a transient false value.
export function createCapacitorShareContentBackend(capacitor: CapacitorApi): CapacitorShareContentBackend {
  const share = capacitor.share;
  return createEntity({
    canShareContent: hasShareableContent,

    async shareContent(content, options) {
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
    },

    async shareContentWithResult(content, options) {
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
    },
  } satisfies Omit<CapacitorShareContentBackend, typeof EntityRuntimeKey>);
}

function hasShareableContent(content: Readonly<ShareContent>): boolean {
  return (
    (content.title !== undefined && content.title !== '') ||
    (content.text !== undefined && content.text !== '') ||
    (content.url !== undefined && content.url !== '')
  );
}
