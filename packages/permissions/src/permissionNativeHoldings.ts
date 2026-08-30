export type PermissionNativeHoldingId = 'clipboard' | 'media' | 'push' | 'wake-lock';

export interface PermissionNativeHolding {
  readonly futureClaimingDomain: PermissionNativeHoldingId;
  readonly id: PermissionNativeHoldingId;
  readonly mode: 'query-and-request' | 'query-only';
  readonly permissionNames: readonly string[];
}

// These are interim native holdings, not ownership claims. Every row names the domain that must
// eventually absorb it. Removing a row is progress; adding one requires a new architecture ruling.
export const PERMISSION_NATIVE_HOLDINGS = [
  {
    futureClaimingDomain: 'media',
    id: 'media',
    mode: 'query-and-request',
    permissionNames: ['camera', 'microphone'],
  },
  {
    futureClaimingDomain: 'wake-lock',
    id: 'wake-lock',
    mode: 'query-and-request',
    permissionNames: ['screen-wake-lock'],
  },
  {
    futureClaimingDomain: 'clipboard',
    id: 'clipboard',
    mode: 'query-only',
    permissionNames: ['clipboard-read', 'clipboard-write'],
  },
  {
    futureClaimingDomain: 'push',
    id: 'push',
    mode: 'query-only',
    permissionNames: ['push'],
  },
] as const satisfies readonly PermissionNativeHolding[];
