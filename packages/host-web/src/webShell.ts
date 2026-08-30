import { createEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, ShellExternalBackend } from '@flighthq/types/contract';

// Web has exactly one genuine Shell capability. A stable Entity lets every web Host share provider
// identity without an enabler, reset, ambient selector, or native-operation stubs.
export const webShellExternalBackend: ShellExternalBackend = createEntity({
  async open(url) {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return { reason: 'operation-failed' };
    }
    try {
      return window.open(url, '_blank', 'noopener') === null ? { reason: 'popup-blocked' } : { reason: 'ok' };
    } catch {
      return { reason: 'operation-failed' };
    }
  },
} satisfies Omit<ShellExternalBackend, typeof EntityRuntimeKey>);
