import { createWebDialogBackend, installDialogHostBackend, observeDialogHostResult } from '@flighthq/dialog/contract';
import type { DialogBackend } from '@flighthq/types/contract';

export function enableHostWebDialog(): void {
  if (_enabled) return;
  _enabled = true;
  const base = createWebDialogBackend();
  const observed: DialogBackend = {
    async confirm(options) {
      const result = await base.confirm(options);
      // The base returns false both for user-cancel and for missing window.confirm. Observe whether
      // the surface exists so the diagnostic distinguishes "no API" from "user said no."
      observeDialogHostResult('confirm', typeof window !== 'undefined' && typeof window.confirm === 'function');
      return result;
    },
    async message(options) {
      const result = await base.message(options);
      observeDialogHostResult('message', typeof window !== 'undefined' && typeof window.alert === 'function');
      return result;
    },
    async openDirectory(options) {
      const result = await base.openDirectory(options);
      observeDialogHostResult('openDirectory', result.length > 0);
      return result;
    },
    async openFile(options) {
      const result = await base.openFile(options);
      observeDialogHostResult('openFile', result.length > 0);
      return result;
    },
    async prompt(options) {
      const result = await base.prompt(options);
      observeDialogHostResult('prompt', typeof window !== 'undefined' && typeof window.prompt === 'function');
      return result;
    },
    async saveFile(options) {
      const result = await base.saveFile(options);
      observeDialogHostResult('saveFile', result !== null);
      return result;
    },
  };
  installDialogHostBackend(observed);
}

export function resetHostWebDialogForTest(): void {
  _enabled = false;
}

let _enabled = false;
