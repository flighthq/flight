import type { InputIngressBackend } from '@flighthq/types/contract';

import * as inputContract from './contract';
import * as inputPublic from './index';

type LegacyInputPointerLockBackendMember = 'exitPointerLock' | 'hasPointerLock';
type LegacyInputPointerLockIngressOperation = Extract<keyof InputIngressBackend, LegacyInputPointerLockBackendMember>;

const LEGACY_INPUT_POINTER_LOCK_EXPORTS = [
  'exitInputPointerLock',
  'hasInputPointerLock',
  'requestInputPointerLock',
] as const;

describe('input exports', () => {
  it('excludes the legacy pointer-lock surface from both export lanes', () => {
    for (const name of LEGACY_INPUT_POINTER_LOCK_EXPORTS) {
      expect(name in inputPublic).toBe(false);
      expect(name in inputContract).toBe(false);
    }
  });

  it('excludes legacy pointer-lock operations from listener ingress', () => {
    const hasNoLegacyOperations: LegacyInputPointerLockIngressOperation extends never ? true : false = true;
    expect(hasNoLegacyOperations).toBe(true);
  });
});
