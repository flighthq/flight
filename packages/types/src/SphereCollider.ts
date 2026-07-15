import type { CollisionResponse } from './CollisionResponse';

export interface SphereCollider extends CollisionResponse {
  kind: 'SphereCollider';
  x: number;
  y: number;
  z: number;
  radius: number;
  mode: 'contain' | 'exclude';
}

export const SphereColliderKind = 'SphereCollider';
