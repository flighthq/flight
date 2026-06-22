import type { CollisionResponse } from './CollisionResponse';

export interface RectangleCollider extends CollisionResponse {
  kind: 'RectangleCollider';
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'exclude' | 'contain';
}

export const RectangleColliderKind = 'RectangleCollider';
