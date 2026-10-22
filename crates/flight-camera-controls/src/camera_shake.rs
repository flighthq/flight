//! Trauma-based deterministic camera shake (TS `cameraShake.ts`).

use flight_entity::allocate_entity;
use flight_math::clamp;

use crate::types::*;

/// Allocates shake state with the documented defaults (TS `createCameraShake`): decay 1.5,
/// frequency 15, rotation amplitude 3, translation amplitude 0.5, zero trauma and time.
// flight-lint: allow(conform-params) D23 B: callers assign authored shake fields after default construction
pub fn create_camera_shake() -> CameraShake {
    let mut out: CameraShake = allocate_entity();
    initialize_camera_shake(&mut out);
    return out;
}

/// Allocates a zeroed offset record (TS `createCameraShakeOffset`).
pub fn create_camera_shake_offset() -> CameraShakeOffset {
    let mut out: CameraShakeOffset = allocate_entity();
    initialize_camera_shake_offset(&mut out);
    return out;
}

/// Builds shake state under construction (TS `initializeCameraShake`).
// flight-lint: allow(conform-params) D23 B: construction establishes defaults before authored field assignment
pub fn initialize_camera_shake(out: &mut CameraShake) {
    out.decay = 1.5;
    out.frequency = 15.0;
    out.rotation_amplitude = 3.0;
    out.time = 0.0;
    out.translation_amplitude = 0.5;
    out.trauma = 0.0;
}

/// Builds a zeroed offset under construction (TS `initializeCameraShakeOffset`).
pub fn initialize_camera_shake_offset(out: &mut CameraShakeOffset) {
    out.rotation_x = 0.0;
    out.rotation_y = 0.0;
    out.rotation_z = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
}

/// Accumulates trauma, clamped to [0, 1] (TS `addCameraShakeTrauma`).
pub fn add_camera_shake_trauma(shake: &mut CameraShake, amount: f32) {
    shake.trauma = clamp(shake.trauma + amount, 0.0, 1.0);
}

/// Zeroes trauma and elapsed time (TS `resetCameraShake`).
pub fn reset_camera_shake(shake: &mut CameraShake) {
    shake.trauma = 0.0;
    shake.time = 0.0;
}

/// Three-frequency sine composite in [-1, 1]; the frequencies are incommensurate so the combined
/// signal has no visible loop period (TS `sampleNoise`).
fn sample_noise(t: f32, seed_a: f32, seed_b: f32, seed_c: f32) -> f32 {
    return ((t * seed_a).sin() + (t * seed_b).sin() + (t * seed_c).sin()) / 3.0;
}

/// Advances the shake clock by `dt`, decays trauma and writes the additive offset into `out` (TS
/// `updateCameraShake`). A zero trauma zeroes the output; the noise is deterministic.
pub fn update_camera_shake(shake: &mut CameraShake, dt: f32, out: &mut CameraShakeOffset) {
    shake.time += dt;
    let decayed = shake.trauma - shake.decay * dt;
    shake.trauma = if decayed < 0.0 { 0.0 } else { decayed };
    if shake.trauma <= 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
        out.rotation_x = 0.0;
        out.rotation_y = 0.0;
        out.rotation_z = 0.0;
        return;
    }
    let intensity = shake.trauma * shake.trauma;
    let t = shake.time * shake.frequency;
    let tx = sample_noise(t, SEED_TX_A, SEED_TX_B, SEED_TX_C);
    let ty = sample_noise(t, SEED_TY_A, SEED_TY_B, SEED_TY_C);
    let tz = sample_noise(t, SEED_TZ_A, SEED_TZ_B, SEED_TZ_C);
    let rx = sample_noise(t, SEED_RX_A, SEED_RX_B, SEED_RX_C);
    let ry = sample_noise(t, SEED_RY_A, SEED_RY_B, SEED_RY_C);
    let rz = sample_noise(t, SEED_RZ_A, SEED_RZ_B, SEED_RZ_C);
    out.x = tx * intensity * shake.translation_amplitude;
    out.y = ty * intensity * shake.translation_amplitude;
    out.z = tz * intensity * shake.translation_amplitude;
    out.rotation_x = rx * intensity * shake.rotation_amplitude;
    out.rotation_y = ry * intensity * shake.rotation_amplitude;
    out.rotation_z = rz * intensity * shake.rotation_amplitude;
}

const SEED_TX_A: f32 = 1.0;
const SEED_TX_B: f32 = 2.31;
const SEED_TX_C: f32 = 3.53;
const SEED_TY_A: f32 = 1.17;
const SEED_TY_B: f32 = 2.63;
const SEED_TY_C: f32 = 3.89;
const SEED_TZ_A: f32 = 1.37;
const SEED_TZ_B: f32 = 2.41;
const SEED_TZ_C: f32 = 3.71;
const SEED_RX_A: f32 = 1.53;
const SEED_RX_B: f32 = 2.79;
const SEED_RX_C: f32 = 3.47;
const SEED_RY_A: f32 = 1.71;
const SEED_RY_B: f32 = 2.17;
const SEED_RY_C: f32 = 3.91;
const SEED_RZ_A: f32 = 1.89;
const SEED_RZ_B: f32 = 2.53;
const SEED_RZ_C: f32 = 3.29;
