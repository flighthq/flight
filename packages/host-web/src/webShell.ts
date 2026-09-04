import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, ShellExternalBackend } from '@flighthq/types/contract';

export function initializeWebShellExternalBackend(out: EntityConstruction<ShellExternalBackend>): void {
  out.open = async (url) => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return { reason: 'operation-failed' };
    }
    try {
      return window.open(url, '_blank', 'noopener') === null ? { reason: 'popup-blocked' } : { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  };
}

// Web has exactly one genuine Shell capability. A stable Entity lets every web Host share provider
// identity without an enabler, reset, ambient selector, or native-operation stubs.
export const webShellExternalBackend = (() => {
  const out = allocateEntity<ShellExternalBackend>();
  initializeWebShellExternalBackend(out);
  return finishEntity(out);
})();
