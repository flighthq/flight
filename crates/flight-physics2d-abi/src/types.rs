// flight-lint: allow-file(f64) D1: the wire carries IEEE doubles (TS Float64Array readback rows) and the step dt is flight-physics2d's f64 timestep
//! The Physics2D ABI records (TS `types/Physics2DAbi.ts`, final-owned here per D8): handles and
//! object ids, the execution and step statuses, the command stream, the structure-of-arrays readback
//! buffers, the contact hooks and the backend seam itself.

use std::sync::Arc;

use flight_collision::CollisionShape2D;
use flight_entity::{EntityRuntimeSlot, Float64Array, Ref, Uint8Array, Uint32Array};
use flight_physics2d::Physics2DQueryFilter;
use flight_spatial::SpatialAabb2D;

/// A world handle (TS `Physics2DAbiWorldHandle`): a non-zero unsigned 32-bit integer allocated by
/// the implementation and never reused by that ABI instance; `0` is the allocation-failure sentinel.
pub type Physics2DAbiWorldHandle = u32;

/// A caller-selected body, collider or joint id (TS `Physics2DAbiObjectId`): non-zero, stable until
/// its object is destroyed.
pub type Physics2DAbiObjectId = u32;

/// A world's availability (TS `Physics2DAbiWorldStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DAbiWorldStatus {
    Busy,
    Ready,
    Stale,
}

/// The outcome of applying a command stream (TS `Physics2DAbiExecutionStatus`). Application is
/// deliberately partial: every command before the reported one committed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DAbiExecutionStatus {
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

/// Where command application stopped (TS `Physics2DAbiExecutionResult`, an Entity). `command_index`
/// names the first command that was not applied; `byte_offset` is that record's start.
pub struct Physics2DAbiExecutionResult {
    runtime: EntityRuntimeSlot,
    pub byte_offset: usize,
    pub command_index: u32,
    pub command_kind: u32,
    pub status: Physics2DAbiExecutionStatus,
}

/// A fixed-capacity, little-endian command stream (TS `Physics2DAbiCommandBuffer`, an Entity).
/// Writers return false without changing the record when the next command cannot be encoded or does
/// not fit; capacity growth is explicit.
pub struct Physics2DAbiCommandBuffer {
    runtime: EntityRuntimeSlot,
    pub byte_length: usize,
    pub command_count: u32,
    pub data: Box<Uint8Array>,
}

/// Structure-of-arrays body readback (TS `Physics2DAbiBodyBuffer`, an Entity). `required_count` is
/// the whole answer and `count` the prefix that fit.
pub struct Physics2DAbiBodyBuffer {
    runtime: EntityRuntimeSlot,
    pub count: usize,
    pub flags: Box<Uint32Array>,
    pub ids: Box<Uint32Array>,
    pub required_count: usize,
    pub values: Box<Float64Array>,
}

/// Which contacts a contact read publishes (TS `Physics2DAbiContactSelection`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DAbiContactSelection {
    All,
    Began,
    Ended,
}

/// Structure-of-arrays contact readback (TS `Physics2DAbiContactBuffer`, an Entity). Each contact
/// owns one id/flag row and one value row; `point_starts`/`point_counts` select its points.
pub struct Physics2DAbiContactBuffer {
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

/// A contact hook (TS `Physics2DAbiContactHook`): it receives one contact at a time in step order
/// and may change only the Enabled flag, friction and restitution. The same buffer is reused for
/// every invocation.
pub type Physics2DAbiContactHook = Arc<dyn Fn(&mut Physics2DAbiContactBuffer) + Send + Sync>;

/// The hooks a step runs (TS `Physics2DAbiContactHooks`). Plain record; the buffer is the shared
/// caller-owned record every invocation rewrites.
#[derive(Clone)]
pub struct Physics2DAbiContactHooks {
    pub buffer: Ref<Physics2DAbiContactBuffer>,
    pub post_solve: Option<Physics2DAbiContactHook>,
    pub pre_solve: Option<Physics2DAbiContactHook>,
}

/// The outcome of a step (TS `Physics2DAbiStepStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DAbiStepStatus {
    BusyWorld,
    Complete,
    Declined,
    InsufficientHookBuffer,
    StaleWorld,
}

/// Joint ids and their latest reaction (TS `Physics2DAbiJointBuffer`, an Entity). `flags` carries
/// the Broken bit; broken rows are one-read events.
pub struct Physics2DAbiJointBuffer {
    runtime: EntityRuntimeSlot,
    pub count: usize,
    pub flags: Box<Uint32Array>,
    pub ids: Box<Uint32Array>,
    pub required_count: usize,
    pub values: Box<Float64Array>,
}

/// Query output shared by point, region, ray and shape-cast calls (TS `Physics2DAbiQueryBuffer`, an
/// Entity). Point and region hits leave the geometric row zero.
pub struct Physics2DAbiQueryBuffer {
    runtime: EntityRuntimeSlot,
    pub body_ids: Box<Uint32Array>,
    pub collider_ids: Box<Uint32Array>,
    pub count: usize,
    pub required_count: usize,
    pub values: Box<Float64Array>,
}

// The backend seam's method signatures (TS `Physics2DAbi` methods), stored as D9 callbacks. They are
// an open protocol, so they keep the source parameter order (the `out` record last).
pub type Physics2DAbiCreateWorld = Arc<dyn Fn() -> Physics2DAbiWorldHandle + Send + Sync>;
pub type Physics2DAbiDestroyWorld = Arc<dyn Fn(Physics2DAbiWorldHandle) -> bool + Send + Sync>;
pub type Physics2DAbiGetWorldStatus =
    Arc<dyn Fn(Physics2DAbiWorldHandle) -> Physics2DAbiWorldStatus + Send + Sync>;
pub type Physics2DAbiExecute = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            &Physics2DAbiCommandBuffer,
            &mut Physics2DAbiExecutionResult,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics2DAbiStep = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            f64,
            Option<&Physics2DAbiContactHooks>,
        ) -> Physics2DAbiStepStatus
        + Send
        + Sync,
>;
pub type Physics2DAbiReadBodies = Arc<
    dyn Fn(Physics2DAbiWorldHandle, Option<&Uint32Array>, &mut Physics2DAbiBodyBuffer) -> bool
        + Send
        + Sync,
>;
pub type Physics2DAbiReadContacts = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            Physics2DAbiContactSelection,
            &mut Physics2DAbiContactBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics2DAbiReadJoints =
    Arc<dyn Fn(Physics2DAbiWorldHandle, &mut Physics2DAbiJointBuffer) -> bool + Send + Sync>;
pub type Physics2DAbiQueryPoint = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            f32,
            f32,
            Option<&Physics2DQueryFilter>,
            &mut Physics2DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics2DAbiQueryRay = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            f32,
            f32,
            f32,
            f32,
            f32,
            bool,
            Option<&Physics2DQueryFilter>,
            &mut Physics2DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics2DAbiQueryRegion = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            &SpatialAabb2D,
            Option<&Physics2DQueryFilter>,
            &mut Physics2DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;
pub type Physics2DAbiQueryShapeCast = Arc<
    dyn Fn(
            Physics2DAbiWorldHandle,
            &CollisionShape2D,
            f32,
            f32,
            f32,
            Option<&Physics2DQueryFilter>,
            &mut Physics2DAbiQueryBuffer,
        ) -> bool
        + Send
        + Sync,
>;

/// The narrow backend seam (TS `Physics2DAbi`, an Entity). Apps normally call the free functions;
/// the callbacks live here so another implementation can replace `create_physics2d_abi` and reuse
/// every codec and convenience function. Persistent backend state lives in what the callbacks
/// capture (D5), never in module globals.
pub struct Physics2DAbi {
    runtime: EntityRuntimeSlot,
    pub capabilities: u32,
    pub create_world: Physics2DAbiCreateWorld,
    pub destroy_world: Physics2DAbiDestroyWorld,
    pub execute: Physics2DAbiExecute,
    pub get_world_status: Physics2DAbiGetWorldStatus,
    pub query_point: Physics2DAbiQueryPoint,
    pub query_ray: Physics2DAbiQueryRay,
    pub query_region: Physics2DAbiQueryRegion,
    pub query_shape_cast: Physics2DAbiQueryShapeCast,
    pub read_bodies: Physics2DAbiReadBodies,
    pub read_contacts: Physics2DAbiReadContacts,
    pub read_joints: Physics2DAbiReadJoints,
    pub step: Physics2DAbiStep,
    pub version: u32,
}

// D12 allocation bootstrap: every initializer replaces each field, so these placeholders (empty
// arrays, an all-stale backend) are never observable through the public API.
impl Default for Physics2DAbi {
    fn default() -> Self {
        return Physics2DAbi {
            runtime: EntityRuntimeSlot::default(),
            capabilities: 0,
            create_world: Arc::new(|| 0),
            destroy_world: Arc::new(|_| false),
            execute: Arc::new(|_, _, _| false),
            get_world_status: Arc::new(|_| Physics2DAbiWorldStatus::Stale),
            query_point: Arc::new(|_, _, _, _, _| false),
            query_ray: Arc::new(|_, _, _, _, _, _, _, _, _| false),
            query_region: Arc::new(|_, _, _, _| false),
            query_shape_cast: Arc::new(|_, _, _, _, _, _, _| false),
            read_bodies: Arc::new(|_, _, _| false),
            read_contacts: Arc::new(|_, _, _| false),
            read_joints: Arc::new(|_, _| false),
            step: Arc::new(|_, _, _| Physics2DAbiStepStatus::StaleWorld),
            version: 0,
        };
    }
}

impl Default for Physics2DAbiBodyBuffer {
    fn default() -> Self {
        return Physics2DAbiBodyBuffer {
            runtime: EntityRuntimeSlot::default(),
            count: 0,
            flags: Box::new([]),
            ids: Box::new([]),
            required_count: 0,
            values: Box::new([]),
        };
    }
}

impl Default for Physics2DAbiCommandBuffer {
    fn default() -> Self {
        return Physics2DAbiCommandBuffer {
            runtime: EntityRuntimeSlot::default(),
            byte_length: 0,
            command_count: 0,
            data: Box::new([]),
        };
    }
}

impl Default for Physics2DAbiContactBuffer {
    fn default() -> Self {
        return Physics2DAbiContactBuffer {
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

impl Default for Physics2DAbiExecutionResult {
    fn default() -> Self {
        return Physics2DAbiExecutionResult {
            runtime: EntityRuntimeSlot::default(),
            byte_offset: 0,
            command_index: 0,
            command_kind: 0,
            status: Physics2DAbiExecutionStatus::Complete,
        };
    }
}

impl Default for Physics2DAbiJointBuffer {
    fn default() -> Self {
        return Physics2DAbiJointBuffer {
            runtime: EntityRuntimeSlot::default(),
            count: 0,
            flags: Box::new([]),
            ids: Box::new([]),
            required_count: 0,
            values: Box::new([]),
        };
    }
}

impl Default for Physics2DAbiQueryBuffer {
    fn default() -> Self {
        return Physics2DAbiQueryBuffer {
            runtime: EntityRuntimeSlot::default(),
            body_ids: Box::new([]),
            collider_ids: Box::new([]),
            count: 0,
            required_count: 0,
            values: Box::new([]),
        };
    }
}

flight_entity::impl_entity!(Physics2DAbi);
flight_entity::impl_entity!(Physics2DAbiBodyBuffer);
flight_entity::impl_entity!(Physics2DAbiCommandBuffer);
flight_entity::impl_entity!(Physics2DAbiContactBuffer);
flight_entity::impl_entity!(Physics2DAbiExecutionResult);
flight_entity::impl_entity!(Physics2DAbiJointBuffer);
flight_entity::impl_entity!(Physics2DAbiQueryBuffer);
