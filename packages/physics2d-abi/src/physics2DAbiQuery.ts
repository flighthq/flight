import type {
  CollisionBuiltInShape2D,
  Physics2DAbi,
  Physics2DAbiQueryBuffer,
  Physics2DAbiWorldHandle,
  Physics2DQueryFilter,
  SpatialAabb2D,
} from '@flighthq/types/contract';

export function queryPhysics2DAbiPoint(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  x: number,
  y: number,
  out: Physics2DAbiQueryBuffer,
  filter: Readonly<Physics2DQueryFilter> | null = null,
): boolean {
  return abi.queryPoint(world, x, y, filter, out);
}

export function queryPhysics2DAbiRay(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  out: Physics2DAbiQueryBuffer,
  maxFraction = Number.POSITIVE_INFINITY,
  filter: Readonly<Physics2DQueryFilter> | null = null,
): boolean {
  return abi.queryRay(world, originX, originY, directionX, directionY, maxFraction, false, filter, out);
}

export function queryPhysics2DAbiRayClosest(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  out: Physics2DAbiQueryBuffer,
  maxFraction = Number.POSITIVE_INFINITY,
  filter: Readonly<Physics2DQueryFilter> | null = null,
): boolean {
  return abi.queryRay(world, originX, originY, directionX, directionY, maxFraction, true, filter, out);
}

export function queryPhysics2DAbiRegion(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  region: Readonly<SpatialAabb2D>,
  out: Physics2DAbiQueryBuffer,
  filter: Readonly<Physics2DQueryFilter> | null = null,
): boolean {
  return abi.queryRegion(world, region, filter, out);
}

export function queryPhysics2DAbiShapeCast(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  shape: Readonly<CollisionBuiltInShape2D>,
  dx: number,
  dy: number,
  out: Physics2DAbiQueryBuffer,
  maxFraction = 1,
  filter: Readonly<Physics2DQueryFilter> | null = null,
): boolean {
  return abi.queryShapeCast(world, shape, dx, dy, maxFraction, filter, out);
}
