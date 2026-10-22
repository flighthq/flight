//! The ABI's world queries (TS `physics3DAbiQuery.ts`): thin free functions over the backend seam
//! that pack hits into a caller-owned query buffer. Query scalars are Physics3D's f32.

use flight_collision::CollisionShape3D;
use flight_physics3d::Physics3DQueryFilter;
use flight_spatial::SpatialAabb3D;

use crate::types::*;

/// Packs the colliders containing a point (TS `queryPhysics3DAbiPoint`).
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics3d_abi_point(
    out: &mut Physics3DAbiQueryBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    x: f32,
    y: f32,
    z: f32,
    filter: Option<&Physics3DQueryFilter>,
) -> bool {
    return (abi.query_point)(world, x, y, z, filter, out);
}

/// Packs every ray hit, nearest first (TS `queryPhysics3DAbiRay`); `max_fraction` defaults to
/// unbounded.
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics3d_abi_ray(
    out: &mut Physics3DAbiQueryBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics3DQueryFilter>,
) -> bool {
    return (abi.query_ray)(
        world,
        origin_x,
        origin_y,
        origin_z,
        direction_x,
        direction_y,
        direction_z,
        max_fraction.unwrap_or(f32::INFINITY),
        false,
        filter,
        out,
    );
}

/// Packs the nearest ray hit only (TS `queryPhysics3DAbiRayClosest`).
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics3d_abi_ray_closest(
    out: &mut Physics3DAbiQueryBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics3DQueryFilter>,
) -> bool {
    return (abi.query_ray)(
        world,
        origin_x,
        origin_y,
        origin_z,
        direction_x,
        direction_y,
        direction_z,
        max_fraction.unwrap_or(f32::INFINITY),
        true,
        filter,
        out,
    );
}

/// Packs the colliders overlapping a region (TS `queryPhysics3DAbiRegion`).
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics3d_abi_region(
    out: &mut Physics3DAbiQueryBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    region: &SpatialAabb3D,
    filter: Option<&Physics3DQueryFilter>,
) -> bool {
    return (abi.query_region)(world, region, filter, out);
}

/// Packs the first hit of a swept shape (TS `queryPhysics3DAbiShapeCast`); `max_fraction` defaults
/// to the full sweep, 1.
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics3d_abi_shape_cast(
    out: &mut Physics3DAbiQueryBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    shape: &CollisionShape3D,
    dx: f32,
    dy: f32,
    dz: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics3DQueryFilter>,
) -> bool {
    return (abi.query_shape_cast)(
        world,
        shape,
        dx,
        dy,
        dz,
        max_fraction.unwrap_or(1.0),
        filter,
        out,
    );
}
