use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{Rectangle, Vector2, copy_rectangle, create_rectangle};
use flight_node::Node;
use flight_scene2d::{Node2DRuntime, Node2DRuntimeMethods, create_node2d, create_node2d_runtime};
use flight_scene3d::Node3D;

use flight_particles::{ParticleEmitterConfig, ParticleEmitterState};

use crate::emit_particle_burst_2d::emit_particle_burst_2d_impl;
use crate::particle_emitter::{
    append_particle_emitter_2d_particle_impl,
    clear_particle_emitter_2d_impl,
    compact_particle_emitter_2d_impl,
    create_particle_emitter_data,
    get_particle_emitter_2d_capacity_impl,
    get_particle_emitter_2d_particle_alpha_impl,
    get_particle_emitter_2d_particle_id_impl,
    get_particle_emitter_2d_particle_velocity_impl,
    remove_particle_emitter_2d_particle_impl,
    reserve_particle_emitter_2d_impl,
    set_particle_emitter_2d_particle_impl,
    set_particle_emitter_2d_particle_alpha_impl,
    set_particle_emitter_2d_particle_color_impl,
    set_particle_emitter_2d_particle_velocity_impl,
};
use crate::types::*;

// flight-lint: allow(conform-params) D16: Rust allocate_entity() pattern; no TS PartialNode overlay
pub fn create_particle_emitter_2d() -> Ref<ParticleEmitter2D> {
    let mut out: ParticleEmitter2D = create_node2d(
        PARTICLE_EMITTER_2D_KIND.to_string(),
        None,
        Some(create_particle_emitter_2d_runtime),
    );
    out.data = create_particle_emitter_data();
    out.particle_emitter_2d_runtime = ParticleEmitter2DRuntime::default();
    return flight_scene2d::publish_node2d(out);
}

pub fn create_particle_emitter_2d_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(copy_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

// flight-lint: allow(conform-params) D16: Rust allocate_entity() pattern; no TS PartialNode overlay
pub fn create_particle_emitter_3d() -> Ref<ParticleEmitter3D> {
    let mut out: ParticleEmitter3D =
        flight_scene3d::create_node3d(Some(PARTICLE_EMITTER_3D_KIND.to_string()));
    out.data = create_particle_emitter_data();
    out.blend_mode = Some("normal".to_string());
    return flight_scene3d::publish_node3d(out);
}

pub fn append_particle_emitter_2d_particle(
    target: &Ref<ParticleEmitter2D>,
    id: u16,
    x: f32,
    y: f32,
    rotation: f32,
    scale: f32,
) -> usize {
    let mut guard = target.write().unwrap();
    return append_particle_emitter_2d_particle_impl(&mut guard.data, id, x, y, rotation, scale);
}

pub fn clear_particle_emitter_2d(target: &Ref<ParticleEmitter2D>) {
    let mut guard = target.write().unwrap();
    clear_particle_emitter_2d_impl(&mut guard.data);
}

pub fn clone_particle_emitter_2d(source: &ParticleEmitter2D) -> Ref<ParticleEmitter2D> {
    let mut out: ParticleEmitter2D = create_node2d(
        PARTICLE_EMITTER_2D_KIND.to_string(),
        None,
        Some(create_particle_emitter_2d_runtime),
    );
    out.data = source.data.clone();
    out.particle_emitter_2d_runtime = ParticleEmitter2DRuntime::default();
    return flight_scene2d::publish_node2d(out);
}

pub fn clone_particle_emitter_3d(source: &ParticleEmitter3D) -> Ref<ParticleEmitter3D> {
    let mut out: ParticleEmitter3D =
        flight_scene3d::create_node3d(Some(PARTICLE_EMITTER_3D_KIND.to_string()));
    out.data = source.data.clone();
    out.blend_mode = source.blend_mode.clone();
    return flight_scene3d::publish_node3d(out);
}

pub fn compact_particle_emitter_2d(target: &Ref<ParticleEmitter2D>) {
    let mut guard = target.write().unwrap();
    compact_particle_emitter_2d_impl(&mut guard.data);
}

fn copy_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    if let Some(pe) = source.as_any().downcast_ref::<ParticleEmitter2D>() {
        if let Some(ref rect) = pe.particle_emitter_2d_runtime.local_bounds_rectangle {
            copy_rectangle(out, rect);
        }
    }
}

pub fn emit_particle_burst_2d(
    emitter: &Ref<ParticleEmitter2D>,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    count: f32,
    x: f32,
    y: f32,
    tint: Option<u32>,
) -> usize {
    let mut guard = emitter.write().unwrap();
    return emit_particle_burst_2d_impl(&mut guard.data, state, config, count, x, y, tint);
}

pub fn get_particle_emitter_2d_capacity(source: &Ref<ParticleEmitter2D>) -> usize {
    let guard = source.read().unwrap();
    return get_particle_emitter_2d_capacity_impl(&guard.data);
}

pub fn get_particle_emitter_2d_particle_alpha(
    source: &Ref<ParticleEmitter2D>,
    index: usize,
) -> f32 {
    let guard = source.read().unwrap();
    return get_particle_emitter_2d_particle_alpha_impl(&guard.data, index);
}

pub fn get_particle_emitter_2d_particle_id(
    source: &Ref<ParticleEmitter2D>,
    index: usize,
) -> i32 {
    let guard = source.read().unwrap();
    return get_particle_emitter_2d_particle_id_impl(&guard.data, index);
}

pub fn get_particle_emitter_2d_particle_velocity(
    out: &mut Vector2,
    source: &Ref<ParticleEmitter2D>,
    index: usize,
) -> bool {
    let guard = source.read().unwrap();
    return get_particle_emitter_2d_particle_velocity_impl(out, &guard.data, index);
}

pub fn get_particle_emitter_2d_runtime(source: &ParticleEmitter2D) -> &ParticleEmitter2DRuntime {
    return &source.particle_emitter_2d_runtime;
}

pub fn get_particle_emitter_3d_runtime(source: &dyn Node3D) -> &flight_scene3d::Node3DRuntime {
    return source.node3d_fields().node3d_runtime();
}

pub fn is_particle_emitter_3d(node: &dyn Node) -> bool {
    return node.node_fields().kind == PARTICLE_EMITTER_3D_KIND;
}

pub fn remove_particle_emitter_2d_particle(
    target: &Ref<ParticleEmitter2D>,
    index: usize,
) {
    let mut guard = target.write().unwrap();
    remove_particle_emitter_2d_particle_impl(&mut guard.data, index);
}

pub fn reserve_particle_emitter_2d(
    target: &Ref<ParticleEmitter2D>,
    capacity: usize,
) {
    let mut guard = target.write().unwrap();
    reserve_particle_emitter_2d_impl(&mut guard.data, capacity);
}

// flight-lint: allow(conform-params) D16: Rust takes NodeRef for invalidation; TS mutates through structural typing
pub fn set_particle_emitter_2d_local_bounds_rectangle(
    target: &flight_node::NodeRef,
    rect: &Rectangle,
) {
    let mut guard = target.write().unwrap();
    let pe = guard.as_any_mut().downcast_mut::<ParticleEmitter2D>().unwrap();
    if pe.particle_emitter_2d_runtime.local_bounds_rectangle.is_none() {
        pe.particle_emitter_2d_runtime.local_bounds_rectangle = Some(create_rectangle(0.0, 0.0, 0.0, 0.0));
    }
    copy_rectangle(
        pe.particle_emitter_2d_runtime.local_bounds_rectangle.as_mut().unwrap(),
        rect,
    );
    let runtime = pe.node_runtime_mut();
    runtime.local_bounds_id = runtime.local_bounds_id.wrapping_add(1);
}

pub fn set_particle_emitter_2d_particle(
    target: &Ref<ParticleEmitter2D>,
    index: usize,
    id: u16,
    x: f32,
    y: f32,
    rotation: f32,
    scale: f32,
) {
    let mut guard = target.write().unwrap();
    set_particle_emitter_2d_particle_impl(&mut guard.data, index, id, x, y, rotation, scale);
}

pub fn set_particle_emitter_2d_particle_alpha(
    target: &Ref<ParticleEmitter2D>,
    index: usize,
    alpha: f32,
) {
    let mut guard = target.write().unwrap();
    set_particle_emitter_2d_particle_alpha_impl(&mut guard.data, index, alpha);
}

pub fn set_particle_emitter_2d_particle_color(
    target: &Ref<ParticleEmitter2D>,
    index: usize,
    r: f32,
    g: f32,
    b: f32,
) {
    let mut guard = target.write().unwrap();
    set_particle_emitter_2d_particle_color_impl(&mut guard.data, index, r, g, b);
}

pub fn set_particle_emitter_2d_particle_velocity(
    target: &Ref<ParticleEmitter2D>,
    index: usize,
    vx: f32,
    vy: f32,
) {
    let mut guard = target.write().unwrap();
    set_particle_emitter_2d_particle_velocity_impl(&mut guard.data, index, vx, vy);
}
