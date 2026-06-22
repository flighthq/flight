import type { CollisionResponse } from './CollisionResponse';

export interface CircleCollider extends CollisionResponse {
  kind: 'CircleCollider';
  x: number;
  y: number;
  radius: number;
  mode: 'exclude' | 'contain';
}

export const CircleColliderKind = 'CircleCollider';
