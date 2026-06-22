import type { Entity, EntityWithoutRuntime } from './Entity';

// A plane in the form a·x + b·y + c·z + d = 0. (a, b, c) is the plane normal — unit-length
// when normalized — and `d` is the signed distance from the origin along that normal. The
// signed distance of a point p to the plane is a·p.x + b·p.y + c·p.z + d; positive is the
// side the normal points toward.
export interface Plane extends Entity {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type PlaneLike = EntityWithoutRuntime<Plane>;
