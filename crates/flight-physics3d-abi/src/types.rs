// flight-lint: allow-file(f64) D1: the wire carries IEEE doubles (TS Float64Array readback rows)
//! The Physics3D ABI records (TS `types/Physics3DAbi.ts`, final-owned here per D8): handles and
//! object ids, the execution and step statuses, the command stream, the structure-of-arrays readback
//! buffers, the contact hooks and the backend seam itself.

use std::sync::Arc;

use flight_collision::CollisionShape3D;
use flight_entity::{EntityRuntimeSlot, Float64Array, Ref, Uint8Array, Uint32Array};
use flight_physics3d::Physics3DQueryFilter;
use flight_spatial::SpatialAabb3D;

/// A world handle (TS `Physics3DAbiWorldHandle`): a non-zero unsigned 32-bit integer allocated by
/// the implementation and never reused by that ABI instance; `0` is the allocation-failure sentinel.
pub type Physics3DAbiWorldHandle = u32;

/// A caller-selected body, collider or joint id (TS `Physics3DAbiObjectId`): non-zero, stable until
/// its object is destroyed.
pub type Physics3DAbiObjectId = u32;

/// A world's availability (TS `Physics3DAbiWorldStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics3DAbiWorldStatus {
    Busy,
    Ready,
    Stale,
}

/// The outcome of applying a command stream (TS `Physics3DAbiExecutionStatus`). Application is
/// deliberately partial: every command before the reported one committed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics3DAbiExecutionStatus {
    BusyWorld,
    Complete,
    InvalidBuffer,
    InvalidCommand,
    MissingBody,
    MissingCollider,
    MissingJoint,
    RejectedMutation,
    StaleWorld,
    UnsupportedJoint,
    UnsupportedShape,
}

/// Where command application stopped (TS `Physics3DAbiExecutionResult`, an Entity). `command_index`
/// names the first command that was not applied; `byte_offset` is that record's start.
pub struct Physics3DAbiExecutionResult {
    runtime: EntityRuntimeSlot,
    pub byte_offset: usize,
    pub command_index: u32,
    pub command_kind: u32,
    pub status: Physics3DAbiExecutionStatus,
}

/// A fixed-capacity, little-endian command stream (TS `Physics3DAbiCommandBuffer`, an Entity).
/// Writers return false without changing the record when the next command cannot be encoded or does
/// not fit; capacity growth is explicit.
pub struct Physics3DAbiCommandBuffer {
    runtime: EntityRuntimeSlot,
    pub byte_length: usize,
    pub command_count: u32,
    pub data: Box<Uint8Array>,
}

/// Structure-of-arrays body readback (TS `Physics3DAbiBodyBuffer`, an Entity). `required_count` is
/// the whole answer and `count` the prefix that fit.
pub struct Physics3DAbiBodyBuffer {
    runtime: EntityRuntimeSlot,
    pub count: usize,
    pub flags: Box<Uint32Array>,
    pub ids: Box<Uint32Array>,
    pub required_count: usize,
    pub values: Box<Float64Array>,
}

/// Which contacts a contact read publishes (TS `Physics3DAbiContactSelection`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics3DAbiContactSelection {
    All,
    Began,
    Ended,
}

/// Structure-of-arrays contact readback (TS `Physics3DAbiContactBuffer`, an Entity). Each contact
/// owns one id/flag row and one value row; `point_starts`/`point_counts` select its points.
pub struct Physics3DAbiContactBuffer {
    runtime: EntityRuntimeSlot,
    pub count: usize,
    pub flags: Box<Uint32Array>,
    pub ids: Box<Uint32Array>,
    pub point_count: usize,
    pub point_counts: Box<Uint32Array>,
    pub point_feature_ids: Box<Uint32Array>,
    pub point_starts: Box<Uint32Array>,
    pub point_values: Box<Float64Array>,
    pub required_count: usize,
    pub required_point_count: usize,
    pub values: Box<Float64Array>,
}

/// A contact hook (TS `Physics3DAbiContactHook`): it receives one contact at a time in step order
/// and may change only the Enabled flag, friction and restitution. The same buffer is reused for
/// every invocation.
pub type Physics3DAbiContactHook = Arc<dyn Fn(&mut Physics3DAbiContactBuffer) + Send + Sync>;

/// The hooks a step runs (TS `Physics3DAbiContactHooks`). Plain record; the buffer is the shared
/// caller-owned record every invocation rewrites.
#[derive(Clone)]
pub struct Physics3DAbiContactHooks {
    pub buffer: Ref<Physics3DAbiContactBuffer>,
    pub post_solve: Option<Physics3DAbiContactHook>,
    pub pre_solve: Option<Physics3DAbiContactHook>,
}

/// The outcome of a step (TS `Physics3DAbiStepStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics3DAbiStepStatus {
    BusyWorld,
    Complete,
    Declined,
    InsufficientHookBuffer,
    StaleWorld,
}

/// Joint ids and their latest reaction (TS `Physics3DAbiJointBuffer`, an Entity). `flags` carries
/// the Broken bit. A kind that cannot report a reaction writes zeroes.
pub struct Physics3DAbiJointBuffer {
    runtime: EntityRuntimeSlot,
    pub count: usize,
    pub flags: Box<Uint32Array>,
    pub ids: Box<Uint32Array>,
    pub required_count: usize,
    pub values: Box<Float64Array>,
}

/// Query output shared by point, region, ray and shape-cast calls (TS `Physics3DAbiQueryBuffer`, an
/// Entity). Point and region hits leave the geometric row zero.
pub struct Physics3DAbiQueryBuffer {
    runtime: EntityRuntimeSlot,
    pub body_ids: Box<Uint32Array>,
    pub collider_ids: Box<Uint32Array>,
    pub count: usize,
    pub required_count: usize,
    pub values: Box<Float64Array>,
}

// The backend seam's method signatures (TS `Physics3DAbi` methods), stored as D9 callbacks. They are
// an open protocol, so they keep the source parameter order (the `out` record last).
pub type Physics3DAbiCreateWorld = Arc<dyn Fn() -> Physics3DAbiWorldHandle + Send + Sync>;
pub type Physics3DAbiDestroyWorld = Arc<dyn Fn(Physics3DAbiWorldHandle) -> bool + Send + Sync>;
pub type Physics3DAbiGetWorldStatus =
    Arc<dyn Fn(Physics3DAbiWorldHandle) -> Physics3DAbiWorldStatus + Send + Sync>;
pub type Physics3DAbiExecute = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            &Physics3DAbiCommandBuffer,
            &mut Physics3DAbiExecutionResult,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics3DAbiStep = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            f32,
            Option<&Physics3DAbiContactHooks>,
        ) -> Physics3DAbiStepStatus
        + Send
        + Sync,
>;
pub type Physics3DAbiReadBodies = Arc<
    dyn Fn(Physics3DAbiWorldHandle, Option<&Uint32Array>, &mut Physics3DAbiBodyBuffer) -> bool
        + Send
        + Sync,
>;
pub type Physics3DAbiReadContacts = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            Physics3DAbiContactSelection,
            &mut Physics3DAbiContactBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics3DAbiReadJoints =
    Arc<dyn Fn(Physics3DAbiWorldHandle, &mut Physics3DAbiJointBuffer) -> bool + Send + Sync>;
pub type Physics3DAbiQueryPoint = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            f32,
            f32,
            f32,
            Option<&Physics3DQueryFilter>,
            &mut Physics3DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics3DAbiQueryRay = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            f32,
            f32,
            f32,
            f32,
            f32,
            f32,
            f32,
            bool,
            Option<&Physics3DQueryFilter>,
            &mut Physics3DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics3DAbiQueryRegion = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            &SpatialAabb3D,
            Option<&Physics3DQueryFilter>,
            &mut Physics3DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics3DAbiQueryShapeCast = Arc<
    dyn Fn(
            Physics3DAbiWorldHandle,
            &CollisionShape3D,
            f32,
            f32,
            f32,
            f32,
            Option<&Physics3DQueryFilter>,
            &mut Physics3DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;

/// The narrow backend seam (TS `Physics3DAbi`, an Entity). Apps normally call the free functions;
/// the callbacks live here so another implementation can replace `create_physics3d_abi` and reuse
/// every codec and convenience function. Persistent backend state lives in what the callbacks
/// capture (D5), never in module globals.
pub struct Physics3DAbi {
    runtime: EntityRuntimeSlot,
    pub capabilities: u32,
    pub create_world: Physics3DAbiCreateWorld,
    pub destroy_world: Physics3DAbiDestroyWorld,
    pub execute: Physics3DAbiExecute,
    pub get_world_status: Physics3DAbiGetWorldStatus,
    pub query_point: Physics3DAbiQueryPoint,
    pub query_ray: Physics3DAbiQueryRay,
    pub query_region: Physics3DAbiQueryRegion,
    pub query_shape_cast: Physics3DAbiQueryShapeCast,
    pub read_bodies: Physics3DAbiReadBodies,
    pub read_contacts: Physics3DAbiReadContacts,
    pub read_joints: Physics3DAbiReadJoints,
    pub step: Physics3DAbiStep,
    pub version: u32,
}

// D12 allocation bootstrap: every initializer replaces each field, so these placeholders (empty
// arrays, an all-stale backend) are never observable through the public API.
impl Default for Physics3DAbi {
    fn default() -> Self {
        return Physics3DAbi {
            runtime: EntityRuntimeSlot::default(),
            capabilities: 0,
            create_world: Arc::new(|| 0),
            destroy_world: Arc::new(|_| false),
            execute: Arc::new(|_, _, _| false),
            get_world_status: Arc::new(|_| Physics3DAbiWorldStatus::Stale),
            query_point: Arc::new(|_, _, _, _, _, _| false),
            query_ray: Arc::new(|_, _, _, _, _, _, _, _, _, _, _| false),
            query_region: Arc::new(|_, _, _, _| false),
            query_shape_cast: Arc::new(|_, _, _, _, _, _, _, _| false),
            read_bodies: Arc::new(|_, _, _| false),
            read_contacts: Arc::new(|_, _, _| false),
            read_joints: Arc::new(|_, _| false),
            step: Arc::new(|_, _, _| Physics3DAbiStepStatus::StaleWorld),
            version: 0,
        };
    }
}

impl Default for Physics3DAbiBodyBuffer {
    fn default() -> Self {
        return Physics3DAbiBodyBuffer {
            runtime: EntityRuntimeSlot::default(),
            count: 0,
            flags: Box::new([]),
            ids: Box::new([]),
            required_count: 0,
            values: Box::new([]),
        };
    }
}

impl Default for Physics3DAbiCommandBuffer {
    fn default() -> Self {
        return Physics3DAbiCommandBuffer {
            runtime: EntityRuntimeSlot::default(),
            byte_length: 0,
            command_count: 0,
            data: Box::new([]),
        };
    }
}

impl Default for Physics3DAbiContactBuffer {
    fn default() -> Self {
        return Physics3DAbiContactBuffer {
            runtime: EntityRuntimeSlot::default(),
            count: 0,
            flags: Box::new([]),
            ids: Box::new([]),
            point_count: 0,
            point_counts: Box::new([]),
            point_feature_ids: Box::new([]),
            point_starts: Box::new([]),
            point_values: Box::new([]),
            required_count: 0,
            required_point_count: 0,
            values: Box::new([]),
        };
    }
}

impl Default for Physics3DAbiExecutionResult {
    fn default() -> Self {
        return Physics3DAbiExecutionResult {
            runtime: EntityRuntimeSlot::default(),
            byte_offset: 0,
            command_index: 0,
            command_kind: 0,
            status: Physics3DAbiExecutionStatus::Complete,
        };
    }
}

impl Default for Physics3DAbiJointBuffer {
    fn default() -> Self {
        return Physics3DAbiJointBuffer {
            runtime: EntityRuntimeSlot::default(),
            count: 0,
            flags: Box::new([]),
            ids: Box::new([]),
            required_count: 0,
            values: Box::new([]),
        };
    }
}

impl Default for Physics3DAbiQueryBuffer {
    fn default() -> Self {
        return Physics3DAbiQueryBuffer {
            runtime: EntityRuntimeSlot::default(),
            body_ids: Box::new([]),
            collider_ids: Box::new([]),
            count: 0,
            required_count: 0,
            values: Box::new([]),
        };
    }
}

flight_entity::impl_entity!(Physics3DAbi);
flight_entity::impl_entity!(Physics3DAbiBodyBuffer);
flight_entity::impl_entity!(Physics3DAbiCommandBuffer);
flight_entity::impl_entity!(Physics3DAbiContactBuffer);
flight_entity::impl_entity!(Physics3DAbiExecutionResult);
flight_entity::impl_entity!(Physics3DAbiJointBuffer);
flight_entity::impl_entity!(Physics3DAbiQueryBuffer);
