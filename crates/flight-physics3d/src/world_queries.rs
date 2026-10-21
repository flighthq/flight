// flight-lint: allow-file(conform-params) D5/D9b: collision registry is explicit and native query outputs stay first
use flight_collision::{
    CollisionColliderShape3D, CollisionRegistry3D, CollisionShape3D,
    create_collision_raycast_hit3d, create_collision_time_of_impact3d,
    get_collision_shape_contains_point3d,
};
use flight_entity::allocate_entity;
use flight_spatial::SpatialAabb3D;

use crate::*;

pub fn create_physics_3d_query_filter() -> Physics3DQueryFilter {
    Physics3DQueryFilter {
        category_bits: u32::MAX,
        mask_bits: u32::MAX,
        ..Physics3DQueryFilter::default()
    }
}

pub fn create_physics_3d_query_result() -> Physics3DQueryResult {
    let mut out = allocate_entity();
    initialize_physics_3d_query_result(&mut out);
    out
}

pub fn create_physics_3d_ray_result() -> Physics3DRayResult {
    let mut out = allocate_entity();
    initialize_physics_3d_ray_result(&mut out);
    out
}

pub fn create_physics_3d_shape_cast_result() -> Physics3DShapeCastResult {
    let mut out = allocate_entity();
    initialize_physics_3d_shape_cast_result(&mut out);
    out
}

pub fn initialize_physics_3d_query_result(out: &mut Physics3DQueryResult) {
    out.hits.clear();
    out.hit_count = 0;
}

pub fn initialize_physics_3d_ray_result(out: &mut Physics3DRayResult) {
    out.hits.clear();
    out.hit_count = 0;
}

pub fn initialize_physics_3d_shape_cast_result(out: &mut Physics3DShapeCastResult) {
    *out = Physics3DShapeCastResult::default();
    out.collider_index = -1;
}

fn bounds_overlap(a: &SpatialAabb3D, b: &SpatialAabb3D) -> bool {
    a.min_x <= b.max_x
        && a.max_x >= b.min_x
        && a.min_y <= b.max_y
        && a.max_y >= b.min_y
        && a.min_z <= b.max_z
        && a.max_z >= b.min_z
}

fn compare_ray_hits(a: &Physics3DRayHit, b: &Physics3DRayHit) -> std::cmp::Ordering {
    a.fraction
        .total_cmp(&b.fraction)
        .then_with(|| {
            a.body
                .read()
                .unwrap()
                .index
                .cmp(&b.body.read().unwrap().index)
        })
        .then(a.collider_index.cmp(&b.collider_index))
}

fn passes_body_filter(body: &RigidBody3D, filter: Option<&Physics3DQueryFilter>) -> bool {
    filter.is_none_or(|filter| match body.body_type {
        Physics3DBodyType::Dynamic => filter.include_dynamic,
        Physics3DBodyType::Kinematic => filter.include_kinematic,
        Physics3DBodyType::Static => filter.include_static,
    })
}

fn passes_collider_filter(
    collider: &Physics3DCollider,
    filter: Option<&Physics3DQueryFilter>,
) -> bool {
    filter.is_none_or(|filter| {
        (filter.include_sensors || !collider.sensor)
            && collider.filter.category_bits & filter.category_bits != 0
            && collider.filter.mask_bits & filter.mask_bits != 0
    })
}

pub fn query_physics_3d_point(
    out: &mut Physics3DQueryResult,
    world: &mut Physics3DWorld,
    x: f32,
    y: f32,
    z: f32,
    filter: Option<&Physics3DQueryFilter>,
) {
    out.hit_count = 0;
    if !x.is_finite() || !y.is_finite() || !z.is_finite() {
        return;
    }
    synchronize_physics_3d_broadphase(world);
    let mut candidates = Vec::new();
    (world.index.query_spatial_point)(&mut candidates, x, y, z);
    candidates.sort_unstable();
    for index in candidates {
        let Some(body_ref) = world.body_by_index.get(&index).cloned() else {
            continue;
        };
        let body = body_ref.read().unwrap();
        if !passes_body_filter(&body, filter) {
            continue;
        }
        for (collider_index, collider_ref) in body.colliders.iter().enumerate() {
            let collider = collider_ref.read().unwrap();
            if !passes_collider_filter(&collider, filter) {
                continue;
            }
            let CollisionColliderShape3D::BuiltIn(shape) = &collider.world else {
                continue;
            };
            if get_collision_shape_contains_point3d(shape, x, y, z) {
                write_query_hit(out, &body_ref, collider_ref, collider_index);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn query_physics_3d_ray(
    out: &mut Physics3DRayResult,
    world: &mut Physics3DWorld,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics3DQueryFilter>,
) {
    query_ray_internal(
        out,
        world,
        origin_x,
        origin_y,
        origin_z,
        direction_x,
        direction_y,
        direction_z,
        max_fraction.unwrap_or(f32::INFINITY),
        filter,
        false,
    );
}

#[allow(clippy::too_many_arguments)]
pub fn query_physics_3d_ray_closest(
    out: &mut Physics3DRayResult,
    world: &mut Physics3DWorld,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics3DQueryFilter>,
) {
    query_ray_internal(
        out,
        world,
        origin_x,
        origin_y,
        origin_z,
        direction_x,
        direction_y,
        direction_z,
        max_fraction.unwrap_or(f32::INFINITY),
        filter,
        true,
    );
}

pub fn query_physics_3d_region(
    out: &mut Physics3DQueryResult,
    world: &mut Physics3DWorld,
    region: &SpatialAabb3D,
    filter: Option<&Physics3DQueryFilter>,
) {
    out.hit_count = 0;
    if !valid_region(region) {
        return;
    }
    synchronize_physics_3d_broadphase(world);
    let mut candidates = Vec::new();
    (world.index.query_spatial_region)(&mut candidates, region);
    candidates.sort_unstable();
    for index in candidates {
        let Some(body_ref) = world.body_by_index.get(&index).cloned() else {
            continue;
        };
        let body = body_ref.read().unwrap();
        if !passes_body_filter(&body, filter) {
            continue;
        }
        for (collider_index, collider_ref) in body.colliders.iter().enumerate() {
            let collider = collider_ref.read().unwrap();
            if !passes_collider_filter(&collider, filter) {
                continue;
            }
            let mut bounds = SpatialAabb3D::default();
            write_physics_3d_collider_bounds(&collider, &mut bounds);
            if bounds_overlap(&bounds, region) {
                write_query_hit(out, &body_ref, collider_ref, collider_index);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn query_physics_3d_shape_cast(
    out: &mut Physics3DShapeCastResult,
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    shape: &CollisionShape3D,
    dx: f32,
    dy: f32,
    dz: f32,
    max_fraction: Option<f32>,
    filter: Option<&Physics3DQueryFilter>,
) {
    initialize_physics_3d_shape_cast_result(out);
    let max_fraction = max_fraction.unwrap_or(1.0);
    if ![dx, dy, dz, max_fraction]
        .iter()
        .all(|value| value.is_finite())
        || max_fraction < 0.0
    {
        return;
    }
    synchronize_physics_3d_broadphase(world);
    let shape = CollisionColliderShape3D::BuiltIn(shape.clone());
    let mut best = f32::INFINITY;
    let candidates = world.bodies.clone();
    for body_ref in candidates {
        let body = body_ref.read().unwrap();
        if !passes_body_filter(&body, filter) {
            continue;
        }
        for (collider_index, collider_ref) in body.colliders.iter().enumerate() {
            let collider = collider_ref.read().unwrap();
            if !passes_collider_filter(&collider, filter) {
                continue;
            }
            let mut hit = create_collision_time_of_impact3d();
            if !sweep_physics_3d_collider_shapes(
                &mut hit,
                registry,
                &shape,
                dx,
                dy,
                dz,
                &collider.world,
                0.0,
                0.0,
                0.0,
                Some(max_fraction),
            ) || hit.fraction >= best
            {
                continue;
            }
            best = hit.fraction;
            out.hit = true;
            out.body = Some(body_ref.clone());
            out.collider = Some(collider_ref.clone());
            out.collider_index = collider_index as i32;
            out.fraction = hit.fraction;
            out.x = hit.x;
            out.y = hit.y;
            out.z = hit.z;
            out.normal_x = hit.normal_x;
            out.normal_y = hit.normal_y;
            out.normal_z = hit.normal_z;
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn query_ray_internal(
    out: &mut Physics3DRayResult,
    world: &mut Physics3DWorld,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: f32,
    filter: Option<&Physics3DQueryFilter>,
    closest: bool,
) {
    out.hit_count = 0;
    if ![
        origin_x,
        origin_y,
        origin_z,
        direction_x,
        direction_y,
        direction_z,
    ]
    .iter()
    .all(|value| value.is_finite())
        || max_fraction.is_nan()
        || max_fraction < 0.0
    {
        return;
    }
    synchronize_physics_3d_broadphase(world);
    let mut candidates = Vec::new();
    (world.index.query_spatial_ray)(
        &mut candidates,
        origin_x,
        origin_y,
        origin_z,
        direction_x,
        direction_y,
        direction_z,
    );
    candidates.sort_unstable();
    for index in candidates {
        let Some(body_ref) = world.body_by_index.get(&index).cloned() else {
            continue;
        };
        let body = body_ref.read().unwrap();
        if !passes_body_filter(&body, filter) {
            continue;
        }
        for (collider_index, collider_ref) in body.colliders.iter().enumerate() {
            let collider = collider_ref.read().unwrap();
            if !passes_collider_filter(&collider, filter) {
                continue;
            }
            let mut hit = create_collision_raycast_hit3d();
            if !raycast_physics_3d_collider_shape(
                &mut hit,
                &collider.world,
                origin_x,
                origin_y,
                origin_z,
                direction_x,
                direction_y,
                direction_z,
                Some(max_fraction),
            ) {
                continue;
            }
            let value = Physics3DRayHit {
                body: body_ref.clone(),
                collider: collider_ref.clone(),
                collider_index,
                fraction: hit.fraction,
                x: hit.x,
                y: hit.y,
                z: hit.z,
                normal_x: hit.normal_x,
                normal_y: hit.normal_y,
                normal_z: hit.normal_z,
            };
            if closest {
                if out.hit_count == 0 || compare_ray_hits(&value, &out.hits[0]).is_lt() {
                    if out.hits.is_empty() {
                        out.hits.push(value);
                    } else {
                        out.hits[0] = value;
                    }
                    out.hit_count = 1;
                }
            } else {
                if out.hit_count == out.hits.len() {
                    out.hits.push(value);
                } else {
                    out.hits[out.hit_count] = value;
                }
                out.hit_count += 1;
            }
        }
    }
    if !closest {
        out.hits[..out.hit_count].sort_by(compare_ray_hits);
    }
}

fn valid_region(region: &SpatialAabb3D) -> bool {
    [
        region.min_x,
        region.min_y,
        region.min_z,
        region.max_x,
        region.max_y,
        region.max_z,
    ]
    .iter()
    .all(|value| value.is_finite())
        && region.min_x <= region.max_x
        && region.min_y <= region.max_y
        && region.min_z <= region.max_z
}

fn write_query_hit(
    out: &mut Physics3DQueryResult,
    body: &RigidBody3DRef,
    collider: &Physics3DColliderRef,
    collider_index: usize,
) {
    let hit = Physics3DQueryHit {
        body: body.clone(),
        collider: collider.clone(),
        collider_index,
    };
    if out.hit_count == out.hits.len() {
        out.hits.push(hit);
    } else {
        out.hits[out.hit_count] = hit;
    }
    out.hit_count += 1;
}
