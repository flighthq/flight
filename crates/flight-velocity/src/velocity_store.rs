//! flight-compiler: target-native
//! The velocity sample store: the one piece of velocity whose shape is target-specific. TS keys
//! samples by object identity in a `WeakMap` (arbitrary objects, GC reclamation); Rust keys them by
//! an explicit `SourceId`. Every rule about what a sample means lives in the portable
//! `velocity_sample` module; the source-keyed wrappers here are one lookup plus one portable call.

use std::collections::HashMap;

use flight_entity::EntityRuntimeSlot;
use flight_entity::allocate_entity;
use flight_entity::get_entity_id;
use flight_node::contract::NodeRef;

use crate::Velocity2D;
use crate::VelocityExplanation;
use crate::VelocitySample;
use crate::velocity_sample::create_velocity_sample;
use crate::velocity_sample::explain_velocity_sample;
use crate::velocity_sample::is_velocity_sample_nonzero;
use crate::velocity_sample::read_velocity_sample;
use crate::velocity_sample::write_velocity_sample;

/// An opaque caller-assigned source handle. TS keys the velocity field by object identity
/// (`WeakMap<object, VelocitySample>`); the Rust contract uses an explicit numeric handle, which the
/// transpiler maps back to the object key. This caller-numeric handle is a recorded D0 exception:
/// arbitrary caller objects do not get Entity identity.
// flight-lint: allow(contract-vocabulary) D1 range declaration for opaque source ids: callers must keep values <= 2^53 because TS maps them to object identity keys
pub type SourceId = u64;

/// The velocity field: a frame counter and a map from source identifiers to
/// their per-frame velocity samples. Any system (physics, tween, camera, manual
/// edit) contributes a source's screen-space velocity for the current frame,
/// and any consumer reads it. The accessors are source-agnostic.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct VelocityField {
    pub frame_id: i32,
    pub samples: HashMap<SourceId, VelocitySample>,
    runtime: EntityRuntimeSlot,
}

pub fn create_velocity_field() -> VelocityField {
    let mut out: VelocityField = allocate_entity();
    initialize_velocity_field(&mut out);
    return out;
}

pub fn initialize_velocity_field(out: &mut VelocityField) {
    out.frame_id = 0;
    out.samples = HashMap::new();
}

pub fn begin_velocity_frame(field: &mut VelocityField) {
    field.frame_id += 1;
}

pub fn contribute_velocity(field: &mut VelocityField, source: SourceId, x: f32, y: f32) {
    let frame_id = field.frame_id;
    write_velocity_sample(ensure_velocity_sample(field, source), frame_id, x, y);
}

/// Get-or-create a node's sample, keyed by the node's entity id (TS keys by the node object
/// itself). The node-to-source mapping that lets the transform contributor stay source-agnostic.
// flight-lint: allow(conform-extra) approved velocity native-store split: target-native store lookup, contract-only (TS store gains it when hand-written velocityStore lands)
pub fn ensure_node_velocity_sample<'a>(
    field: &'a mut VelocityField,
    node: &NodeRef,
) -> &'a mut VelocitySample {
    let source = get_entity_id(&*node.read().unwrap());
    return ensure_velocity_sample(field, source);
}

/// Get-or-create a source's per-frame sample. Shared with the transform-delta
/// contributor.
pub fn ensure_velocity_sample(field: &mut VelocityField, source: SourceId) -> &mut VelocitySample {
    return field
        .samples
        .entry(source)
        .or_insert_with(create_velocity_sample);
}

pub fn explain_velocity(field: &VelocityField, source: SourceId) -> VelocityExplanation {
    return explain_velocity_sample(find_velocity_sample(field, source), field.frame_id);
}

/// Looks up a source's sample without creating one. `None` when the source has never been seen.
// flight-lint: allow(conform-extra) approved velocity native-store split: target-native store lookup, contract-only (TS store gains it when hand-written velocityStore lands)
pub fn find_velocity_sample(field: &VelocityField, source: SourceId) -> Option<&VelocitySample> {
    return field.samples.get(&source);
}

/// Writes the source's current-frame velocity into `out`. Returns zero
/// velocity for sources with no sample or whose sample is stale (not touched
/// this frame).
pub fn get_velocity(field: &VelocityField, source: SourceId, out: &mut Velocity2D) {
    read_velocity_sample(find_velocity_sample(field, source), field.frame_id, out);
}

pub fn has_velocity(field: &VelocityField, source: SourceId) -> bool {
    return is_velocity_sample_nonzero(find_velocity_sample(field, source), field.frame_id);
}

/// Zeroes a source's velocity this frame -- a teleport/cut that must not smear.
pub fn suppress_velocity(field: &mut VelocityField, source: SourceId) {
    contribute_velocity(field, source, 0.0, 0.0);
}

impl VelocityField {
    pub fn new() -> Self {
        return create_velocity_field();
    }
}

flight_entity::impl_entity!(VelocityField);
