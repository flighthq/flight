//! Opt-in step diagnostics (TS `enablePhysics2DGuards.ts`). The source's module flag and installed
//! guards are the caller's `Physics2DGuardState` (D5); messages go through flight-log's `log_once`.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};

use crate::explain_physics2d_collision::explain_physics2d_collision;
use crate::explain_physics2d_joints::explain_physics2d_joints;
use crate::explain_physics2d_step::explain_physics2d_step;
use crate::physics2d_strings::*;
use crate::step::{
    set_physics2d_contact_intake_guard, set_physics2d_joint_resolution_guard,
    set_physics2d_step_guard,
};
use crate::types::*;

/// A caller-supplied millisecond clock for the guard log entries.
// flight-lint: allow(f64) D1: millisecond timestamps from the caller's clock
pub type Physics2DGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

/// Whether the guards are installed (TS `arePhysics2DGuardsEnabled`).
// flight-lint: allow(conform-params) D5: the guard state is explicit caller-owned state
pub fn are_physics2d_guards_enabled(guards: &Physics2DGuardState) -> bool {
    return guards.enabled;
}

/// Removes all three guards (TS `disablePhysics2DGuards`).
// flight-lint: allow(conform-params) D5: the guard state is explicit caller-owned state
pub fn disable_physics2d_guards(guards: &mut Physics2DGuardState) {
    set_physics2d_step_guard(guards, None);
    set_physics2d_joint_resolution_guard(guards, None);
    set_physics2d_contact_intake_guard(guards, None);
    guards.enabled = false;
}

/// Installs the step, joint-resolution and contact-intake guards, each warning once per distinct
/// finding (TS `enablePhysics2DGuards`).
// flight-lint: allow(conform-params) D5: explicit guard state, log state and clock replace the source's module state and logger
pub fn enable_physics2d_guards(
    guards: &mut Physics2DGuardState,
    log_state: LogStateRef,
    clock: Physics2DGuardClock,
) {
    let (step_log, step_clock) = (log_state.clone(), clock.clone());
    set_physics2d_step_guard(
        guards,
        Some(Arc::new(move |world, dt| {
            warn_on_unsteppable_physics2d_world(&step_log, step_clock(), world, dt)
        })),
    );
    let (joint_log, joint_clock) = (log_state.clone(), clock.clone());
    set_physics2d_joint_resolution_guard(
        guards,
        Some(Arc::new(move |world| {
            warn_on_unresolved_physics2d_joints(&joint_log, joint_clock(), world)
        })),
    );
    set_physics2d_contact_intake_guard(
        guards,
        Some(Arc::new(move |world| {
            warn_on_undetectable_physics2d_colliders(&log_state, clock(), world)
        })),
    );
    guards.enabled = true;
}

fn get_failing_physics2d_preconditions(explanation: &Physics2DStepExplanation) -> Vec<String> {
    let flags = [
        ("bodyStateValid", explanation.body_state_valid),
        ("contactStateValid", explanation.contact_state_valid),
        ("gravityValid", explanation.gravity_valid),
        ("jointStateValid", explanation.joint_state_valid),
        ("previousTimestepValid", explanation.previous_timestep_valid),
        ("solverConfigValid", explanation.solver_config_valid),
        ("timestepValid", explanation.timestep_valid),
        (
            "velocityIterationsValid",
            explanation.velocity_iterations_valid,
        ),
        (
            "positionIterationsValid",
            explanation.position_iterations_valid,
        ),
    ];
    return flags
        .iter()
        .filter(|(_, valid)| !valid)
        .map(|(name, _)| name.to_string())
        .collect();
}

fn get_unresolved_physics2d_joint_faults(
    explanation: &Physics2DJointResolutionExplanation,
) -> Vec<String> {
    let mut faults: Vec<String> = Vec::new();
    for joint in &explanation.joints {
        if joint.status == Physics2DJointResolutionStatus::Ready {
            continue;
        }
        let fault = format!(
            "{}:{}",
            joint.kind,
            get_physics2d_joint_resolution_status_string(joint.status)
        );
        if !faults.contains(&fault) {
            faults.push(fault);
        }
    }
    faults.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    return faults;
}

fn strings(values: &[String]) -> LogValue {
    return LogValue::Array(
        values
            .iter()
            .map(|value| LogValue::Str(value.clone()))
            .collect(),
    );
}

// flight-lint: allow(f64) D1: millisecond timestamp sampled from the caller's clock
fn warn(
    log_state: &LogStateRef,
    now_ms: f64,
    key: &str,
    list_name: &str,
    list: &[String],
    message: String,
    status: &str,
) {
    let mut record = HashMap::new();
    record.insert(list_name.to_string(), strings(list));
    record.insert("message".to_string(), LogValue::Str(message));
    record.insert("status".to_string(), LogValue::Str(status.to_string()));
    log_once(
        log_state,
        now_ms,
        key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(record)),
        Some("physics2d".to_string()),
    );
}

// flight-lint: allow(f64) D1: millisecond timestamp sampled from the caller's clock
fn warn_on_undetectable_physics2d_colliders(
    log_state: &LogStateRef,
    now_ms: f64,
    world: &Physics2DWorld,
) {
    let explanation = explain_physics2d_collision(world);
    if explanation.status == Physics2DCollisionStatus::Ready {
        return;
    }
    let kinds = &explanation.unsupported_kinds;
    let one = kinds.len() == 1;
    let status = get_physics2d_collision_status_string(explanation.status);
    let message = format!(
        "stepPhysics2D: collider kind{} {} enclose{} no area and so generate{} no contacts, and the bodies carrying {} pass through everything — give the body a shape with area. Call explainPhysics2DCollision(world) for the same finding as data.",
        if one { "" } else { "s" },
        kinds.join(", "),
        if one { "s" } else { "" },
        if one { "s" } else { "" },
        if one { "it" } else { "them" },
    );
    warn(
        log_state,
        now_ms,
        &format!("physics2d:{}:{}", status, kinds.join(",")),
        "kinds",
        kinds,
        message,
        status,
    );
}

// flight-lint: allow(f64) D1: millisecond timestamp sampled from the caller's clock
fn warn_on_unresolved_physics2d_joints(
    log_state: &LogStateRef,
    now_ms: f64,
    world: &Physics2DWorld,
) {
    let explanation = explain_physics2d_joints(world);
    if explanation.status == Physics2DJointResolutionExplanationStatus::Complete {
        return;
    }
    let faults = get_unresolved_physics2d_joint_faults(&explanation);
    let unregistered = faults
        .iter()
        .any(|fault| fault.ends_with(":solver-unregistered"));
    let missing = faults
        .iter()
        .any(|fault| !fault.ends_with(":solver-unregistered"));
    let unresolved_count = explanation.joints.len() - explanation.ready_count;
    let advice = if unregistered {
        " — an unregistered kind is never solved and its constraint simply does not exist, so call registerBuiltInPhysics2DJointSolvers(world) or registerPhysics2DJointSolver(world, kind, solver) for your own kind"
    } else {
        ""
    };
    let endpoint_advice = if missing {
        " — a joint whose endpoint body is gone is skipped for the rest of the world's life and should be removed with the body"
    } else {
        ""
    };
    let status = get_physics2d_joint_resolution_explanation_status_string(explanation.status);
    let message = format!(
        "stepPhysics2D: {} of {} joint{} {} never solved ({}), and the rest of the world simulates normally around {}{}{}. Call explainPhysics2DJoints(world) for the same findings as data, per joint.",
        unresolved_count,
        explanation.joints.len(),
        if explanation.joints.len() == 1 {
            ""
        } else {
            "s"
        },
        if unresolved_count == 1 { "is" } else { "are" },
        faults.join(", "),
        if unresolved_count == 1 { "it" } else { "them" },
        advice,
        endpoint_advice,
    );
    warn(
        log_state,
        now_ms,
        &format!("physics2d:{}:{}", status, faults.join(",")),
        "faults",
        &faults,
        message,
        status,
    );
}

// flight-lint: allow(f64) D1: millisecond timestamp sampled from the caller's clock
fn warn_on_unsteppable_physics2d_world(
    log_state: &LogStateRef,
    now_ms: f64,
    world: &Physics2DWorld,
    dt: f32,
) {
    let explanation = explain_physics2d_step(world, dt);
    let failing = get_failing_physics2d_preconditions(&explanation);
    if failing.is_empty() {
        return;
    }
    let status = get_physics2d_step_status_string(explanation.status);
    let message = format!(
        "stepPhysics2D: the world advanced nothing because {} failed ({}) — call explainPhysics2DStep(world, dt) for the same flags as data, and repair the reported fields.",
        if failing.len() == 1 {
            "a precondition"
        } else {
            "several preconditions"
        },
        failing.join(", "),
    );
    warn(
        log_state,
        now_ms,
        &format!("physics2d:{}:{}", status, failing.join(",")),
        "failing",
        &failing,
        message,
        status,
    );
}
