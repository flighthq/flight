//! flight-compiler: target-native

//! The ABI's world queries (TS `physics2DAbiQuery.ts`): thin free functions over the backend seam
//! that pack hits into a caller-owned query buffer. Query scalars are Physics2D's f64, the same doubles the wire carries.

use flight_collision::CollisionShape2D;
use flight_physics2d::Physics2DQueryFilter;
use flight_spatial::SpatialAabb2D;

use crate::types::*;

/// Packs the colliders containing a point (TS `queryPhysics2DAbiPoint`).
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics2d_abi_point(
    out: &mut Physics2DAbiQueryBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    x: f64,
    y: f64,
    filter: Option<&Physics2DQueryFilter>,
) -> bool {
    return (abi.query_point)(world, x, y, filter, out);
}

/// Packs every ray hit, nearest first (TS `queryPhysics2DAbiRay`); `max_fraction` defaults to
/// unbounded.
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics2d_abi_ray(
    out: &mut Physics2DAbiQueryBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    max_fraction: Option<f64>,
    filter: Option<&Physics2DQueryFilter>,
) -> bool {
    return (abi.query_ray)(
        world,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        max_fraction.unwrap_or(f64::INFINITY),
        false,
        filter,
        out,
    );
}

/// Packs the nearest ray hit only (TS `queryPhysics2DAbiRayClosest`).
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics2d_abi_ray_closest(
    out: &mut Physics2DAbiQueryBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    max_fraction: Option<f64>,
    filter: Option<&Physics2DQueryFilter>,
) -> bool {
    return (abi.query_ray)(
        world,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        max_fraction.unwrap_or(f64::INFINITY),
        true,
        filter,
        out,
    );
}

/// Packs the colliders overlapping a region (TS `queryPhysics2DAbiRegion`).
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics2d_abi_region(
    out: &mut Physics2DAbiQueryBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    region: &SpatialAabb2D,
    filter: Option<&Physics2DQueryFilter>,
) -> bool {
    return (abi.query_region)(world, region, filter, out);
}

/// Packs the first hit of a swept shape (TS `queryPhysics2DAbiShapeCast`); `max_fraction` defaults
/// to the full sweep, 1.
// flight-lint: allow(conform-params) D9b: out first
pub fn query_physics2d_abi_shape_cast(
    out: &mut Physics2DAbiQueryBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    shape: &CollisionShape2D,
    dx: f64,
    dy: f64,
    max_fraction: Option<f64>,
    filter: Option<&Physics2DQueryFilter>,
) -> bool {
    return (abi.query_shape_cast)(
        world,
        shape,
        dx,
        dy,
        max_fraction.unwrap_or(1.0),
        filter,
        out,
    );
}
