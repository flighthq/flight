import type {
  CollisionBuiltInShape3D,
  Physics3DAbi,
  Physics3DAbiQueryBuffer,
  Physics3DAbiWorldHandle,
  Physics3DQueryFilter,
  SpatialAabb3D,
} from '@flighthq/types/contract';

export function queryPhysics3DAbiPoint(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  x: number,
  y: number,
  z: number,
  out: Physics3DAbiQueryBuffer,
  filter: Readonly<Physics3DQueryFilter> | null = null,
): boolean {
  return abi.queryPoint(world, x, y, z, filter, out);
}

export function queryPhysics3DAbiRay(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: Physics3DAbiQueryBuffer,
  maxFraction = Number.POSITIVE_INFINITY,
  filter: Readonly<Physics3DQueryFilter> | null = null,
): boolean {
  return abi.queryRay(
    world,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    maxFraction,
    false,
    filter,
    out,
  );
}

export function queryPhysics3DAbiRayClosest(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: Physics3DAbiQueryBuffer,
  maxFraction = Number.POSITIVE_INFINITY,
  filter: Readonly<Physics3DQueryFilter> | null = null,
): boolean {
  return abi.queryRay(
    world,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    maxFraction,
    true,
    filter,
    out,
  );
}

export function queryPhysics3DAbiRegion(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  region: Readonly<SpatialAabb3D>,
  out: Physics3DAbiQueryBuffer,
  filter: Readonly<Physics3DQueryFilter> | null = null,
): boolean {
  return abi.queryRegion(world, region, filter, out);
}

export function queryPhysics3DAbiShapeCast(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  shape: Readonly<CollisionBuiltInShape3D>,
  dx: number,
  dy: number,
  dz: number,
  out: Physics3DAbiQueryBuffer,
  maxFraction = 1,
  filter: Readonly<Physics3DQueryFilter> | null = null,
): boolean {
  return abi.queryShapeCast(world, shape, dx, dy, dz, maxFraction, filter, out);
}
