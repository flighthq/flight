interface CollisionResponse {
  restitution?: number;
  friction?: number;
}

export interface PlaneCollider extends CollisionResponse {
  type: 'plane';
  nx: number;
  ny: number;
  distance: number;
}

export interface CircleCollider extends CollisionResponse {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
  mode: 'exclude' | 'contain';
}

export interface RectangleCollider extends CollisionResponse {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'exclude' | 'contain';
}

export type ParticleCollider = PlaneCollider | CircleCollider | RectangleCollider;
