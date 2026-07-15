import type { CollisionResponse } from './CollisionResponse';

export interface PlaneCollider extends CollisionResponse {
  kind: 'PlaneCollider';
  nx: number;
  ny: number;
  nz?: number;
  distance: number;
}

export const PlaneColliderKind = 'PlaneCollider';
