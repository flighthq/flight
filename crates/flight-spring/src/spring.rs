use flight_entity::allocate_entity;
use flight_entity::EntityRuntimeSlot;

use crate::SpringConfig;

/// A scalar spring state with current value and velocity.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Spring {
    pub value: f32,
    pub velocity: f32,
    runtime: EntityRuntimeSlot,
}

/// Allocate a scalar spring at `value` with `velocity`. This is the only allocating function for
/// scalar springs; `update_spring`, `reset_spring`, and the settle query all write into or read an
/// existing spring.
pub fn create_spring(value: Option<f32>, velocity: Option<f32>) -> Spring {
    let mut out: Spring = allocate_entity();
    initialize_spring(&mut out, value, velocity);
    return out;
}

/// Writes `value` and `velocity` into a pre-allocated `Spring`.
pub fn initialize_spring(out: &mut Spring, value: Option<f32>, velocity: Option<f32>) {
    out.value = value.unwrap_or(0.0);
    out.velocity = velocity.unwrap_or(0.0);
}

/// Add `velocity` to the spring's current velocity without changing its position. This is the
/// allocation-free flick/throw control: repeated impulses compose additively, and the next analytic
/// step carries their combined velocity into the motion.
pub fn add_spring_impulse(spring: &mut Spring, velocity: f32) {
    spring.velocity += velocity;
}

/// Report whether `spring` has come to rest at `target`: its `value` is within `position_epsilon` of
/// the target AND its `velocity` is within `velocity_epsilon` of zero. Both conditions are required —
/// a spring passing through the target at speed (an underdamped overshoot) is not settled.
///
/// Settle is a property of position and velocity alone, independent of the `SpringConfig` that drove
/// the motion. An undamped spring with nonzero oscillation energy never settles.
pub fn is_spring_settled(
    spring: &Spring,
    target: f32,
    position_epsilon: Option<f32>,
    velocity_epsilon: Option<f32>,
) -> bool {
    let position_epsilon = position_epsilon.unwrap_or(SPRING_SETTLE_EPSILON);
    let velocity_epsilon = velocity_epsilon.unwrap_or(SPRING_SETTLE_EPSILON);
    return (spring.value - target).abs() <= position_epsilon
        && spring.velocity.abs() <= velocity_epsilon;
}

/// Snap `spring` to `value` with `velocity`, discarding its current motion. Use this to teleport a
/// spring to a new state — e.g. initializing it at a target, or cutting a running spring dead.
/// Unlike `update_spring`, this applies no dynamics; the spring simply becomes what is passed.
pub fn reset_spring(spring: &mut Spring, value: f32, velocity: Option<f32>) {
    spring.value = value;
    spring.velocity = velocity.unwrap_or(0.0);
}

/// Advance `spring` one step of `delta_time` seconds toward `target` under `config`, writing the new
/// `value` and `velocity` back into `spring`. This is the scalar primitive; `update_spring2d` and
/// `update_spring3d` call it once per component. The `target` is per-step, not stored on the spring,
/// so it can change every frame.
///
/// The step is the closed-form analytic solution of the damped-harmonic equation
/// `c'' + 2*zeta*omega*c' + omega^2*c = 0` (where `c = value - target`, `omega = 2*PI*frequency`,
/// `zeta = dampingRatio`), evaluated exactly over `delta_time`. Because it is exact rather than an
/// explicit-Euler approximation, it is unconditionally stable.
///
/// `delta_time <= 0` is a no-op. A non-positive `frequency` is an inert spring (no force, no change);
/// `damping_ratio` is clamped to `>= 0`. Inputs are read into locals before any write, so passing a
/// `spring` that also appears elsewhere is safe.
pub fn update_spring(
    spring: &mut Spring,
    target: f32,
    config: &SpringConfig,
    delta_time: f32,
) {
    if delta_time <= 0.0 {
        return;
    }

    let frequency = config.frequency;
    if frequency <= 0.0 {
        return;
    }

    let value = spring.value;
    let velocity = spring.velocity;

    let damping_ratio = if config.damping_ratio < 0.0 {
        0.0
    } else {
        config.damping_ratio
    };
    let omega = std::f32::consts::TAU * frequency;

    // Offset from equilibrium; the analytic solution is in terms of this displacement.
    let c0 = value - target;

    let pos_pos_coef: f32;
    let pos_vel_coef: f32;
    let vel_pos_coef: f32;
    let vel_vel_coef: f32;

    if damping_ratio > 1.0 + CRITICAL_BAND {
        // Overdamped: two distinct real roots z1 < z2 < 0 of s^2 + 2*zeta*omega*s + omega^2.
        let zb = omega * (damping_ratio * damping_ratio - 1.0).sqrt();
        let za = -omega * damping_ratio;
        let z1 = za - zb;
        let z2 = za + zb;
        let e1 = (z1 * delta_time).exp();
        let e2 = (z2 * delta_time).exp();
        let inv_denominator = 1.0 / (z2 - z1);

        pos_pos_coef = (z2 * e1 - z1 * e2) * inv_denominator;
        pos_vel_coef = (e2 - e1) * inv_denominator;
        // z1 * z2 == omega^2 (product of the roots).
        vel_pos_coef = z1 * z2 * (e1 - e2) * inv_denominator;
        vel_vel_coef = (z2 * e2 - z1 * e1) * inv_denominator;
    } else if damping_ratio < 1.0 - CRITICAL_BAND {
        // Underdamped: complex roots -alpha +/- i*beta; oscillates within a decaying envelope.
        let alpha = damping_ratio * omega;
        let beta = omega * (1.0 - damping_ratio * damping_ratio).sqrt();
        let envelope = (-alpha * delta_time).exp();
        let cosine = (beta * delta_time).cos();
        let sine = (beta * delta_time).sin();
        let inv_beta = 1.0 / beta;

        pos_pos_coef = envelope * (cosine + alpha * inv_beta * sine);
        pos_vel_coef = envelope * inv_beta * sine;
        // omega^2 == alpha^2 + beta^2.
        vel_pos_coef = -envelope * omega * omega * inv_beta * sine;
        vel_vel_coef = envelope * (cosine - alpha * inv_beta * sine);
    } else {
        // Critically damped (dampingRatio within CRITICAL_BAND of 1): a repeated real root -omega.
        // Using the closed form here also avoids the divide-by-zero the over/under branches hit
        // exactly at 1.
        let envelope = (-omega * delta_time).exp();
        let omega_dt = omega * delta_time;

        pos_pos_coef = envelope * (1.0 + omega_dt);
        pos_vel_coef = envelope * delta_time;
        vel_pos_coef = -envelope * omega * omega * delta_time;
        vel_vel_coef = envelope * (1.0 - omega_dt);
    }

    spring.value = target + pos_pos_coef * c0 + pos_vel_coef * velocity;
    spring.velocity = vel_pos_coef * c0 + vel_vel_coef * velocity;
}

/// Advance an angular spring toward `target` along the shortest wrapped arc. `full_turn` defines the
/// caller's unit system — use 360 for degrees, `TAU` for radians, or 1 for turns; this function does
/// no unit conversion. The chosen delta is in (-full_turn / 2, full_turn / 2], so exact half-turn
/// ties consistently take the positive direction. The spring remains on its continuous, unwrapped
/// branch to avoid position and velocity discontinuities; callers may normalize the value for
/// presentation. A non-positive or non-finite `full_turn` is an inert sentinel.
pub fn update_spring_angle(
    spring: &mut Spring,
    target: f32,
    full_turn: f32,
    config: &SpringConfig,
    delta_time: f32,
) {
    if !(full_turn > 0.0) || !full_turn.is_finite() {
        return;
    }

    let value = spring.value;
    let half_turn = full_turn * 0.5;
    let wrapped_delta = ((target - value) % full_turn + full_turn) % full_turn;
    let shortest_delta = if wrapped_delta > half_turn {
        wrapped_delta - full_turn
    } else {
        wrapped_delta
    };
    update_spring(spring, value + shortest_delta, config, delta_time);
}

impl Spring {
    pub fn new(value: Option<f32>, velocity: Option<f32>) -> Self {
        return create_spring(value, velocity);
    }

    pub fn add_impulse(&mut self, velocity: f32) {
        add_spring_impulse(self, velocity);
    }

    pub fn is_settled(&self, target: f32, position_epsilon: Option<f32>, velocity_epsilon: Option<f32>) -> bool {
        return is_spring_settled(self, target, position_epsilon, velocity_epsilon);
    }

    pub fn reset(&mut self, value: f32, velocity: Option<f32>) {
        reset_spring(self, value, velocity);
    }

    pub fn update(&mut self, target: f32, config: &SpringConfig, delta_time: f32) {
        update_spring(self, target, config, delta_time);
    }

    pub fn update_angle(
        &mut self,
        target: f32,
        full_turn: f32,
        config: &SpringConfig,
        delta_time: f32,
    ) {
        update_spring_angle(self, target, full_turn, config, delta_time);
    }
}

/// Default position/velocity tolerance for settle detection: fine enough that motion has visually
/// stopped for typical pixel/normalized values, loose enough not to wait on floating-point tails.
const SPRING_SETTLE_EPSILON: f32 = 1e-3;

/// Half-width of the damping-ratio band around 1 treated as critically damped. Inside it the
/// over/under-damped closed forms divide by a vanishing root separation, so the critical form is both
/// numerically safer and physically indistinguishable this close to 1.
const CRITICAL_BAND: f32 = 1e-4;

flight_entity::impl_entity!(Spring);
