use std::collections::HashMap;
use std::sync::Arc;

use flight_collision::CollisionRegistry3D;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_spatial::SpatialIndexingMode;

use crate::*;

// flight-lint: allow(f64) D1: millisecond timestamps come from the caller's logging clock
pub type Physics3DGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

// flight-lint: allow(conform-params) D5: guard state is explicit caller-owned state
pub fn are_physics_3d_guards_enabled(guards: &Physics3DGuardState) -> bool {
    guards.enabled
}

// flight-lint: allow(conform-params) D5: guard state is explicit caller-owned state
pub fn disable_physics_3d_guards(guards: &mut Physics3DGuardState) {
    guards.step_guard = None;
    guards.contact_intake_guard = None;
    guards.joint_resolution_guard = None;
    guards.spatial_indexing_guard = None;
    guards.enabled = false;
}

// flight-lint: allow(conform-params) D5: explicit guard state, log state and clock replace source module state
pub fn enable_physics_3d_guards(
    guards: &mut Physics3DGuardState,
    log_state: LogStateRef,
    clock: Physics3DGuardClock,
) {
    let (step_log, step_clock) = (log_state.clone(), clock.clone());
    guards.step_guard = Some(Arc::new(move |world, dt| {
        warn_step(&step_log, step_clock(), world, dt)
    }));
    let (collision_log, collision_clock) = (log_state.clone(), clock.clone());
    guards.contact_intake_guard = Some(Arc::new(move |world, registry| {
        warn_collision(&collision_log, collision_clock(), world, registry)
    }));
    let (joint_log, joint_clock) = (log_state.clone(), clock.clone());
    guards.joint_resolution_guard = Some(Arc::new(move |world| {
        warn_joints(&joint_log, joint_clock(), world)
    }));
    guards.spatial_indexing_guard = Some(Arc::new(move |world| {
        warn_spatial(&log_state, clock(), world)
    }));
    guards.enabled = true;
}

fn physics_3d_joint_status_string(status: Physics3DJointStatus) -> &'static str {
    match status {
        Physics3DJointStatus::InvalidBodies => "invalid-bodies",
        Physics3DJointStatus::Solvable => "solvable",
        Physics3DJointStatus::UnregisteredKind => "unregistered-kind",
    }
}

#[allow(clippy::too_many_arguments)]
// flight-lint: allow(f64) D1: timestamp sampled from the caller's logging clock
fn warn(
    log: &LogStateRef,
    now: f64,
    key: &str,
    list_name: &str,
    list: Vec<LogValue>,
    message: String,
    status: &str,
) {
    let mut record = HashMap::new();
    record.insert(list_name.to_string(), LogValue::Array(list));
    record.insert("message".to_string(), LogValue::Str(message));
    record.insert("status".to_string(), LogValue::Str(status.to_string()));
    log_once(
        log,
        now,
        key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(record)),
        Some("physics3d".to_string()),
    );
}

// flight-lint: allow(f64) D1: timestamp sampled from the caller's logging clock
fn warn_collision(
    log: &LogStateRef,
    now: f64,
    world: &Physics3DWorld,
    registry: &CollisionRegistry3D,
) {
    let mut e = Physics3DCollisionExplanation::default();
    explain_physics_3d_collision(&mut e, world, registry);
    if e.status == Physics3DCollisionStatus::Ready {
        return;
    }
    let one = e.unsupported_kinds.len() == 1;
    warn(
        log,
        now,
        &format!(
            "physics3d:missing-support:{}",
            e.unsupported_kinds.join(",")
        ),
        "kinds",
        e.unsupported_kinds
            .iter()
            .cloned()
            .map(LogValue::Str)
            .collect(),
        format!(
            "buildPhysics3DContacts: no support function is registered for collider kind{} {}, so these generate no contacts and the bodies carrying {} pass through everything — call registerBuiltInCollisionSupports3D() and registerBuiltInCollisionFaceQueries3D() from @flighthq/collision, or register your own support for a vendor kind.",
            if one { "" } else { "s" },
            e.unsupported_kinds.join(", "),
            if one { "it" } else { "them" },
        ),
        "missing-support",
    );
}

// flight-lint: allow(f64) D1: timestamp sampled from the caller's logging clock
fn warn_joints(log: &LogStateRef, now: f64, world: &Physics3DWorld) {
    let mut explanations = Vec::new();
    explain_physics_3d_joints(&mut explanations, world);
    let joints: Vec<Physics3DJointExplanation> = explanations
        .into_iter()
        .filter(|e| e.status != Physics3DJointStatus::Solvable)
        .collect();
    if joints.is_empty() {
        return;
    }
    let key = joints
        .iter()
        .map(|joint| {
            format!(
                "{}:{}:{}",
                joint.index,
                joint.kind,
                physics_3d_joint_status_string(joint.status)
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let values = joints
        .iter()
        .map(|joint| {
            let mut record = HashMap::new();
            record.insert("index".to_string(), LogValue::Int(joint.index as i64));
            record.insert("kind".to_string(), LogValue::Str(joint.kind.clone()));
            record.insert(
                "status".to_string(),
                LogValue::Str(physics_3d_joint_status_string(joint.status).to_string()),
            );
            LogValue::Record(record)
        })
        .collect();
    warn(
        log,
        now,
        &format!("physics3d:unresolved-joints:{key}"),
        "joints",
        values,
        format!(
            "buildPhysics3DSolveIslands: {} {} omitted from the solve because its kind is unregistered or a body endpoint is missing — call explainPhysics3DJoints(world), then registerBuiltInPhysics3DJointSolvers(world) or registerPhysics3DJointSolver(world, kind, solver) for an unregistered kind, and removePhysics3DJoint(world, joint) or repair an invalid endpoint.",
            joints.len(),
            if joints.len() == 1 {
                "joint was"
            } else {
                "joints were"
            },
        ),
        "unresolved-joints",
    );
}

// flight-lint: allow(f64) D1: timestamp sampled from the caller's logging clock
fn warn_spatial(log: &LogStateRef, now: f64, world: &Physics3DWorld) {
    let mut bodies = Vec::new();
    for body in &world.bodies {
        let index = body.read().unwrap().index;
        if (world.index.explain_spatial_indexing)(index).mode == SpatialIndexingMode::Overflow {
            bodies.push(index);
        }
    }
    if bodies.is_empty() {
        return;
    }
    warn(
        log,
        now,
        "physics3d:spatial-overflow",
        "bodyIndices",
        bodies
            .iter()
            .map(|index| LogValue::Int(i64::from(*index)))
            .collect(),
        format!(
            "synchronizePhysics3DBroadphase: {} {} held in the spatial backend's overflow path, so broadphase queries scan {} linearly — pass createBvhSpatialBackend3D() to createPhysics3DWorld(index) for a mixed-scale world, or tune createUniformGridSpatialBackend3D(cellSize) to the workload's typical body size.",
            bodies.len(),
            if bodies.len() == 1 {
                "body is"
            } else {
                "bodies are"
            },
            if bodies.len() == 1 { "it" } else { "them" },
        ),
        "spatial-overflow",
    );
}

// flight-lint: allow(f64) D1: timestamp sampled from the caller's logging clock
fn warn_step(log: &LogStateRef, now: f64, world: &Physics3DWorld, dt: f32) {
    let mut e = Physics3DStepExplanation::default();
    explain_physics_3d_step(&mut e, world, dt);
    if e.status == Physics3DStepStatus::Ready {
        return;
    }
    let flags = [
        ("bodyStateValid", e.body_state_valid),
        ("colliderStateValid", e.collider_state_valid),
        ("contactStateValid", e.contact_state_valid),
        ("gravityValid", e.gravity_valid),
        ("jointStateValid", e.joint_state_valid),
        ("solverConfigValid", e.solver_config_valid),
        ("substepsValid", e.substeps_valid),
        ("timestepValid", e.timestep_valid),
        ("velocityIterationsValid", e.velocity_iterations_valid),
        ("positionIterationsValid", e.position_iterations_valid),
    ];
    let failing: Vec<String> = flags
        .into_iter()
        .filter(|(_, valid)| !*valid)
        .map(|(name, _)| name.to_string())
        .collect();
    warn(
        log,
        now,
        &format!("physics3d:invalid-step:{}", failing.join(",")),
        "failing",
        failing.iter().cloned().map(LogValue::Str).collect(),
        format!(
            "stepPhysics3D: the world advanced nothing because {} failed ({}) — call explainPhysics3DStep(world, dt) for the same flags as data, and repair the reported fields.",
            if failing.len() == 1 {
                "a precondition"
            } else {
                "several preconditions"
            },
            failing.join(", "),
        ),
        "invalid-step",
    );
}
