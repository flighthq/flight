//! Point, ray, region and swept-shape queries over the world (TS `worldQueries.ts`). Candidates come
//! from the broadphase in ascending body order; reusable results keep a valid `hit_count` prefix.

use flight_collision::{
    CollisionRaycastHit2D, CollisionRegistry2D, CollisionShape2D, create_collision_raycast_hit2d,
    create_collision_time_of_impact2d, get_collision_shape_contains_point2d,
    raycast_collision_shape2d, sweep_collision_shape2d,
};
use flight_entity::{Ref, allocate_entity};
use flight_spatial::SpatialAabb2D;

use crate::broadphase::synchronize_physics2d_broadphase;
use crate::collider_transform::write_physics2d_collider_bounds;
use crate::types::*;
use crate::world::find_physics2d_body;

/// A filter accepting everything (TS `createPhysics2DQueryFilter`).
pub fn create_physics2d_query_filter() -> Physics2DQueryFilter {
    return Physics2DQueryFilter {
        category_bits: 0xffff_ffff,
        mask_bits: 0xffff_ffff,
        include_sensors: true,
        include_dynamic: true,
        include_kinematic: true,
        include_static: true,
    };
}

/// An empty reusable query result (TS `createPhysics2DQueryResult`).
pub fn create_physics2d_query_result() -> Physics2DQueryResult {
    let mut out: Physics2DQueryResult = allocate_entity();
    initialize_physics2d_query_result(&mut out);
    return out;
}

/// An empty reusable ray result (TS `createPhysics2DRayResult`).
pub fn create_physics2d_ray_result() -> Physics2DRayResult {
    let mut out: Physics2DRayResult = allocate_entity();
    initialize_physics2d_ray_result(&mut out);
    return out;
}

/// An empty shape-cast result (TS `createPhysics2DShapeCastResult`).
pub fn create_physics2d_shape_cast_result() -> Physics2DShapeCastResult {
    let mut out: Physics2DShapeCastResult = allocate_entity();
    initialize_physics2d_shape_cast_result(&mut out);
    return out;
}

/// The construction initializer of `create_physics2d_query_result` (TS
/// `initializePhysics2DQueryResult`).
pub fn initialize_physics2d_query_result(out: &mut Physics2DQueryResult) {
    out.hits = Vec::new();
    out.hit_count = 0;
}

/// The construction initializer of `create_physics2d_ray_result` (TS
/// `initializePhysics2DRayResult`).
pub fn initialize_physics2d_ray_result(out: &mut Physics2DRayResult) {
    out.hits = Vec::new();
    out.hit_count = 0;
}

/// The construction initializer of `create_physics2d_shape_cast_result` (TS
/// `initializePhysics2DShapeCastResult`).
pub fn initialize_physics2d_shape_cast_result(out: &mut Physics2DShapeCastResult) {
    clear_shape_cast_result(out);
}

fn bounds_overlap(a: &SpatialAabb2D, b: &SpatialAabb2D) -> bool {
    return a.min_x <= b.max_x && a.max_x >= b.min_x && a.min_y <= b.max_y && a.max_y >= b.min_y;
}

fn clear_shape_cast_result(out: &mut Physics2DShapeCastResult) {
    out.body = None;
    out.collider = None;
    out.collider_index = -1;
    out.hit = false;
    out.fraction = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
}

fn compare_ray_hits(a: &Physics2DRayHit, b: &Physics2DRayHit) -> std::cmp::Ordering {
    if a.fraction != b.fraction {
        return a
            .fraction
            .partial_cmp(&b.fraction)
            .unwrap_or(std::cmp::Ordering::Equal);
    }
    let (body_a, body_b) = (a.body.read().unwrap().index, b.body.read().unwrap().index);
    if body_a != body_b {
        return body_a.cmp(&body_b);
    }
    return a.collider_index.cmp(&b.collider_index);
}

fn is_valid_region(region: &SpatialAabb2D) -> bool {
    return region.min_x.is_finite()
        && region.min_y.is_finite()
        && region.max_x.is_finite()
        && region.max_y.is_finite()
        && region.min_x <= region.max_x
        && region.min_y <= region.max_y;
}

fn passes_body_filter(body: &RigidBody2D, filter: Option<&Physics2DQueryFilter>) -> bool {
    let Some(filter) = filter else {
        return true;
    };
    return match body.body_type {
        Physics2DBodyType::Dynamic => filter.include_dynamic,
        Physics2DBodyType::Kinematic => filter.include_kinematic,
        Physics2DBodyType::Static => filter.include_static,
    };
}

fn passes_collider_filter(
    collider: &Physics2DCollider,
    filter: Option<&Physics2DQueryFilter>,
) -> bool {
    let Some(filter) = filter else {
        return true;
    };
    if !filter.include_sensors && collider.sensor {
        return false;
    }
    return (collider.filter.category_bits & filter.category_bits) != 0
        && (collider.filter.mask_bits & filter.mask_bits) != 0;
}

/// Every collider whose world shape contains the point (TS `queryPhysics2DPoint`).
// flight-lint: allow(conform-params) D9b: out-first
pub fn query_physics2d_point(
    out: &mut Physics2DQueryResult,
    world: &Physics2DWorld,
    x: f32,
    y: f32,
    filter: Option<&Physics2DQueryFilter>,
) {
    out.hit_count = 0;
    if !x.is_finite() || !y.is_finite() {
        return;
    }
    synchronize_physics2d_broadphase(world);
    let mut candidates = Vec::new();
    (world.index.query_spatial_point)(&mut candidates, x, y);
    candidates.sort();
    for body_index in candidates {
        let Some(body) = find_physics2d_body(world, body_index) else {
            continue;
        };
        if !passes_body_filter(&body.read().unwrap(), filter) {
            continue;
        }
        let colliders = body.read().unwrap().colliders.clone();
        for (collider_index, collider) in colliders.iter().enumerate() {
            let contains = {
                let c = collider.read().unwrap();
                passes_collider_filter(&c, filter)
                    && get_collision_shape_contains_point2d(&c.world, x, y)
            };
            if contains {
                write_query_hit(out, &body, collider, collider_index);
            }
        }
    }
}

/// Every collider the ray hits within `max_fraction`, ordered by fraction, body and collider (TS
/// `queryPhysics2DRay`).
// flight-lint: allow(conform-params) D9b: out-first
pub fn query_physics2d_ray(
    out: &mut Physics2DRayResult,
    world: &Physics2DWorld,
    origin_x: f32,
    origin_y: f32,
    direction_x: f32,
    direction_y: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics2DQueryFilter>,
) {
    query_physics2d_ray_internal(
        out,
        world,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        max_fraction,
        filter,
        false,
    );
}

/// The single closest collider the ray hits, ties broken by body then collider (TS
/// `queryPhysics2DRayClosest`).
// flight-lint: allow(conform-params) D9b: out-first
pub fn query_physics2d_ray_closest(
    out: &mut Physics2DRayResult,
    world: &Physics2DWorld,
    origin_x: f32,
    origin_y: f32,
    direction_x: f32,
    direction_y: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics2DQueryFilter>,
) {
    query_physics2d_ray_internal(
        out,
        world,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        max_fraction,
        filter,
        true,
    );
}

// flight-lint: allow(f64) D1: the canonical collision raycast is f64 (measured in flight-collision); hits narrow to the query's f32
fn query_physics2d_ray_internal(
    out: &mut Physics2DRayResult,
    world: &Physics2DWorld,
    origin_x: f32,
    origin_y: f32,
    direction_x: f32,
    direction_y: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics2DQueryFilter>,
    closest_only: bool,
) {
    out.hit_count = 0;
    let max_fraction = max_fraction.unwrap_or(f32::INFINITY);
    if !origin_x.is_finite()
        || !origin_y.is_finite()
        || !direction_x.is_finite()
        || !direction_y.is_finite()
        || max_fraction.is_nan()
        || max_fraction < 0.0
    {
        return;
    }
    synchronize_physics2d_broadphase(world);
    let mut candidates = Vec::new();
    (world.index.query_spatial_ray)(
        &mut candidates,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
    );
    candidates.sort();
    let mut raycast_hit = create_collision_raycast_hit2d();
    for body_index in candidates {
        let Some(body) = find_physics2d_body(world, body_index) else {
            continue;
        };
        if !passes_body_filter(&body.read().unwrap(), filter) {
            continue;
        }
        let colliders = body.read().unwrap().colliders.clone();
        for (collider_index, collider) in colliders.iter().enumerate() {
            let hit = {
                let c = collider.read().unwrap();
                passes_collider_filter(&c, filter)
                    && raycast_collision_shape2d(
                        &mut raycast_hit,
                        &c.world,
                        origin_x as f64,
                        origin_y as f64,
                        direction_x as f64,
                        direction_y as f64,
                        Some(max_fraction as f64),
                    )
            };
            if !hit {
                continue;
            }
            if closest_only {
                write_closest_ray_hit(out, &body, collider, collider_index, &raycast_hit);
            } else {
                write_ray_hit(out, &body, collider, collider_index, &raycast_hit);
            }
        }
    }
    if !closest_only {
        sort_live_ray_hits(out);
    }
}

/// Every collider whose world bounds overlap the region (TS `queryPhysics2DRegion`).
// flight-lint: allow(conform-params) D9b: out-first
pub fn query_physics2d_region(
    out: &mut Physics2DQueryResult,
    world: &Physics2DWorld,
    region: &SpatialAabb2D,
    filter: Option<&Physics2DQueryFilter>,
) {
    out.hit_count = 0;
    if !is_valid_region(region) {
        return;
    }
    synchronize_physics2d_broadphase(world);
    let mut candidates = Vec::new();
    (world.index.query_spatial_region)(&mut candidates, region);
    candidates.sort();
    let mut bounds = SpatialAabb2D::default();
    for body_index in candidates {
        let Some(body) = find_physics2d_body(world, body_index) else {
            continue;
        };
        if !passes_body_filter(&body.read().unwrap(), filter) {
            continue;
        }
        let colliders = body.read().unwrap().colliders.clone();
        for (collider_index, collider) in colliders.iter().enumerate() {
            let overlaps = {
                let c = collider.read().unwrap();
                if !passes_collider_filter(&c, filter) {
                    continue;
                }
                write_physics2d_collider_bounds(&mut bounds, &c);
                bounds_overlap(&bounds, region)
            };
            if overlaps {
                write_query_hit(out, &body, collider, collider_index);
            }
        }
    }
}

/// The first collider a shape swept by `(dx, dy)` hits within `max_fraction` (default 1) (TS
/// `queryPhysics2DShapeCast`).
// flight-lint: allow(conform-params) D9b/D5: out-first, and the collision registry the sweep reads is explicit
pub fn query_physics2d_shape_cast(
    out: &mut Physics2DShapeCastResult,
    world: &Physics2DWorld,
    registry: &CollisionRegistry2D,
    shape: &CollisionShape2D,
    dx: f32,
    dy: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics2DQueryFilter>,
) {
    clear_shape_cast_result(out);
    let max_fraction = max_fraction.unwrap_or(1.0);
    if !dx.is_finite() || !dy.is_finite() {
        return;
    }
    if !max_fraction.is_finite() || max_fraction < 0.0 {
        return;
    }
    synchronize_physics2d_broadphase(world);
    let mut swept = SpatialAabb2D::default();
    if !write_swept_shape_bounds(&mut swept, shape, dx * max_fraction, dy * max_fraction) {
        return;
    }
    let mut candidates = Vec::new();
    (world.index.query_spatial_region)(&mut candidates, &swept);
    candidates.sort();
    let mut time_of_impact = create_collision_time_of_impact2d();
    let mut best_fraction = f32::INFINITY;
    for body_index in candidates {
        let Some(body) = find_physics2d_body(world, body_index) else {
            continue;
        };
        if !passes_body_filter(&body.read().unwrap(), filter) {
            continue;
        }
        let colliders = body.read().unwrap().colliders.clone();
        for (collider_index, collider) in colliders.iter().enumerate() {
            {
                let c = collider.read().unwrap();
                if !passes_collider_filter(&c, filter) {
                    continue;
                }
                if !sweep_collision_shape2d(
                    &mut time_of_impact,
                    registry,
                    shape,
                    dx,
                    dy,
                    &c.world,
                    0.0,
                    0.0,
                    Some(max_fraction),
                ) {
                    continue;
                }
            }
            if time_of_impact.fraction >= best_fraction {
                continue;
            }
            best_fraction = time_of_impact.fraction;
            out.hit = true;
            out.body = Some(body.clone());
            out.collider = Some(collider.clone());
            out.collider_index = collider_index as i32;
            out.fraction = time_of_impact.fraction;
            out.x = time_of_impact.x;
            out.y = time_of_impact.y;
            out.normal_x = time_of_impact.normal_x;
            out.normal_y = time_of_impact.normal_y;
        }
    }
}

fn sort_live_ray_hits(out: &mut Physics2DRayResult) {
    for i in 1..out.hit_count {
        let value = out.hits[i].clone();
        let mut at = i;
        while at > 0 && compare_ray_hits(&value, &out.hits[at - 1]) == std::cmp::Ordering::Less {
            out.hits[at] = out.hits[at - 1].clone();
            at -= 1;
        }
        out.hits[at] = value;
    }
}

// flight-lint: allow(f64) D1: the canonical collision raycast hit is f64; it narrows to the query's f32
fn write_closest_ray_hit(
    out: &mut Physics2DRayResult,
    body: &Ref<RigidBody2D>,
    collider: &Ref<Physics2DCollider>,
    collider_index: usize,
    source: &CollisionRaycastHit2D,
) {
    if out.hit_count == 0 {
        write_ray_hit(out, body, collider, collider_index, source);
        return;
    }
    let fraction = source.fraction as f32;
    let body_index = body.read().unwrap().index;
    let current = &mut out.hits[0];
    let current_index = current.body.read().unwrap().index;
    if fraction > current.fraction
        || (fraction == current.fraction
            && (body_index > current_index
                || (body_index == current_index && collider_index >= current.collider_index)))
    {
        return;
    }
    current.body = body.clone();
    current.collider = collider.clone();
    current.collider_index = collider_index;
    current.fraction = fraction;
    current.normal_x = source.normal_x as f32;
    current.normal_y = source.normal_y as f32;
    current.x = source.x as f32;
    current.y = source.y as f32;
}

fn write_query_hit(
    out: &mut Physics2DQueryResult,
    body: &Ref<RigidBody2D>,
    collider: &Ref<Physics2DCollider>,
    collider_index: usize,
) {
    let hit = Physics2DQueryHit {
        body: body.clone(),
        collider: collider.clone(),
        collider_index,
    };
    if out.hit_count < out.hits.len() {
        out.hits[out.hit_count] = hit;
    } else {
        out.hits.push(hit);
    }
    out.hit_count += 1;
}

// flight-lint: allow(f64) D1: the canonical collision raycast hit is f64; it narrows to the query's f32
fn write_ray_hit(
    out: &mut Physics2DRayResult,
    body: &Ref<RigidBody2D>,
    collider: &Ref<Physics2DCollider>,
    collider_index: usize,
    source: &CollisionRaycastHit2D,
) {
    let hit = Physics2DRayHit {
        body: body.clone(),
        collider: collider.clone(),
        collider_index,
        fraction: source.fraction as f32,
        normal_x: source.normal_x as f32,
        normal_y: source.normal_y as f32,
        x: source.x as f32,
        y: source.y as f32,
    };
    if out.hit_count < out.hits.len() {
        out.hits[out.hit_count] = hit;
    } else {
        out.hits.push(hit);
    }
    out.hit_count += 1;
}

fn write_swept_shape_bounds(
    out: &mut SpatialAabb2D,
    shape: &CollisionShape2D,
    dx: f32,
    dy: f32,
) -> bool {
    let mut probe: Physics2DCollider = allocate_entity();
    probe.world = shape.clone();
    write_physics2d_collider_bounds(out, &probe);
    if !out.min_x.is_finite() || !out.max_y.is_finite() {
        return false;
    }
    if dx < 0.0 {
        out.min_x += dx;
    } else {
        out.max_x += dx;
    }
    if dy < 0.0 {
        out.min_y += dy;
    } else {
        out.max_y += dy;
    }
    return true;
}
