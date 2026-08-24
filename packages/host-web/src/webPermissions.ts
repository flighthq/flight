import {
  createWebPermissionBackend,
  installPermissionHostBackend,
  observePermissionHostResult,
} from '@flighthq/permissions/contract';
import type { PermissionBackend } from '@flighthq/types/contract';

export function enableHostWebPermission(): void {
  if (_enabled) return;
  _enabled = true;
  const raw = createWebPermissionBackend();
  const observed: PermissionBackend = {
    async getState(name) {
      try {
        const state = await raw.getState(name);
        observePermissionHostResult('getState', true);
        return state;
      } catch (err) {
        observePermissionHostResult('getState', false);
        throw err;
      }
    },
    async request(name) {
      try {
        const state = await raw.request(name);
        observePermissionHostResult('request', true);
        return state;
      } catch (err) {
        observePermissionHostResult('request', false);
        throw err;
      }
    },
  };
  installPermissionHostBackend(observed);
}

export function resetHostWebPermissionsForTest(): void {
  _enabled = false;
}

let _enabled = false;
