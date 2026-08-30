export type PermissionNativeHoldingId = 'clipboard' | 'media' | 'push' | 'wake-lock';

export interface PermissionNativeHolding {
  readonly futureClaimingDomain: PermissionNativeHoldingId;
  readonly id: PermissionNativeHoldingId;
  readonly mode: 'query-and-request' | 'query-only';
  readonly permissionNames: readonly string[];
}
