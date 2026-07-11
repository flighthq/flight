import type { ShareBackend, ShareContent } from '@flighthq/types';

import type { CapacitorApi } from './capacitorModule';

// Maps Flight's ShareBackend onto Capacitor's `@capacitor/share`. `share`/`shareWithResult` are async
// and map directly; a user cancel rejects, resolving false / a dismissed ShareResult rather than
// throwing. Capacitor's `canShare` is async while the ShareBackend availability probes (isAvailable,
// canShare) are synchronous, so the adapter prefetches the availability boolean once at construction and
// the sync probes read it — reporting false until that first probe resolves. Portable ShareFile
// descriptors carry data URLs, which Capacitor's file-URI `files` field cannot accept, so only
// title/text/url cross; a content that is only files reports canShare false.
export function createCapacitorShareBackend(capacitor: CapacitorApi): ShareBackend {
  const share = capacitor.share;
  // Sync availability probes over async Capacitor: prefetch canShare once and cache the boolean.
  let cachedAvailable = false;
  share
    .canShare()
    .then((result) => {
      cachedAvailable = result.value;
    })
    .catch(() => {
      /* leave false */
    });
  return {
    isAvailable() {
      return cachedAvailable;
    },
    canShare(content) {
      return cachedAvailable && hasShareableText(content);
    },
    async share(content, options) {
      if (!hasShareableText(content)) return false;
      try {
        await share.share({
          title: content.title,
          text: content.text,
          url: content.url,
          dialogTitle: options?.chooserTitle,
        });
        return true;
      } catch {
        return false;
      }
    },
    async shareWithResult(content, options) {
      if (!hasShareableText(content)) return { completed: false, activityType: null, dismissed: false };
      try {
        const result = await share.share({
          title: content.title,
          text: content.text,
          url: content.url,
          dialogTitle: options?.chooserTitle,
        });
        return { completed: true, activityType: result.activityType ?? null, dismissed: false };
      } catch {
        // A rejected share is a user dismissal, not a programmer error.
        return { completed: false, activityType: null, dismissed: true };
      }
    },
  };
}

// Capacitor's share sheet needs at least one of title/text/url; data-URL files are not expressible.
function hasShareableText(content: Readonly<ShareContent>): boolean {
  return content.title !== undefined || content.text !== undefined || content.url !== undefined;
}
