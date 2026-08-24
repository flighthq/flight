import { createWebShareBackend, installShareHostBackend, observeShareHostResult } from '@flighthq/share/contract';
import type { ShareBackend } from '@flighthq/types/contract';

export function enableHostWebShare(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebShareBackend();
  const backend: ShareBackend = {
    isAvailable() {
      return inner.isAvailable();
    },

    canShare(content) {
      const result = inner.canShare(content);
      observeShareHostResult('canShare', result);
      return result;
    },

    async share(content, options?) {
      const result = await inner.share(content, options);
      observeShareHostResult('share', result);
      return result;
    },

    async shareWithResult(content, options?) {
      const result = await inner.shareWithResult(content, options);
      observeShareHostResult('shareWithResult', result.completed);
      return result;
    },
  };
  installShareHostBackend(backend);
}

export function resetHostWebShareForTest(): void {
  _enabled = false;
}

let _enabled = false;
