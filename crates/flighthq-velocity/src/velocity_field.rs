//! Core velocity field: frame boundary, contribution, retrieval, suppression.
//!
//! The [`VelocityField`] is the generic seam: any system contributes a
//! source object's screen-space velocity for the current frame via a stable
//! `u64` source id, and any consumer reads it. Explicit contributions
//! (via [`contribute_velocity`]) win over the transform-delta baseline
//! ([`contribute_transform_velocity`]) regardless of call order, because
//! explicit contributions set an `explicit_frame_id` that the baseline
//! respects.
//!
//! Call [`begin_velocity_frame`] once at the start of each frame to advance
//! the frame counter. Samples not updated this frame return zero velocity
//! from [`get_velocity`].

use flighthq_types::{Velocity2D, VelocityField, VelocitySample};

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Advances the field's frame counter.
///
/// Call once at the start of each frame before any velocity contributions.
/// Samples that are not updated in the new frame become stale and return zero
/// from [`get_velocity`].
pub fn begin_velocity_frame(field: &mut VelocityField) {
    field.frame_id += 1;
}

/// Records an explicit velocity `(x, y)` for the source identified by
/// `source_id` this frame.
///
/// Explicit contributions take priority over the transform-delta baseline:
/// a call to [`contribute_transform_velocity`] later in the same frame will
/// not overwrite this value.
pub fn contribute_velocity(field: &mut VelocityField, source_id: u64, x: f32, y: f32) {
    let frame_id = field.frame_id;
    let sample = ensure_velocity_sample(field, source_id);
    sample.velocity.x = x;
    sample.velocity.y = y;
    sample.last_frame_id = frame_id;
    sample.explicit_frame_id = frame_id;
}

/// Creates an empty [`VelocityField`] at frame 0.
pub fn create_velocity_field() -> VelocityField {
    VelocityField {
        samples: std::collections::HashMap::new(),
        frame_id: 0,
    }
}

/// Returns the existing [`VelocitySample`] for `source_id`, or inserts and
/// returns a fresh sample.
///
/// A fresh sample's `last_frame_id` and `explicit_frame_id` use the
/// [`STALE_FRAME_ID`] sentinel so a never-touched sample never reads as fresh,
/// even at frame 0. Used internally by both explicit and transform-delta
/// contributors.
pub fn ensure_velocity_sample(field: &mut VelocityField, source_id: u64) -> &mut VelocitySample {
    field
        .samples
        .entry(source_id)
        .or_insert_with(|| VelocitySample {
            previous_world_transform: None,
            velocity: Velocity2D { x: 0.0, y: 0.0 },
            last_frame_id: STALE_FRAME_ID,
            explicit_frame_id: STALE_FRAME_ID,
        })
}

/// Writes the source's current-frame velocity into `out`.
///
/// Returns zero velocity for sources with no sample or whose sample was not
/// updated this frame (stale). Safe when `out` is any mutable `Velocity2D`.
pub fn get_velocity(field: &VelocityField, source_id: u64, out: &mut Velocity2D) {
    match field.samples.get(&source_id) {
        Some(sample) if sample.last_frame_id == field.frame_id => {
            out.x = sample.velocity.x;
            out.y = sample.velocity.y;
        }
        _ => {
            out.x = 0.0;
            out.y = 0.0;
        }
    }
}

/// Returns `true` when `source_id` has a non-zero velocity updated this frame.
pub fn has_velocity(field: &VelocityField, source_id: u64) -> bool {
    match field.samples.get(&source_id) {
        Some(sample) => {
            sample.last_frame_id == field.frame_id
                && (sample.velocity.x != 0.0 || sample.velocity.y != 0.0)
        }
        None => false,
    }
}

/// Forces the source's velocity to zero this frame — use after a teleport or
/// cut to prevent motion-smear artefacts in downstream effects.
pub fn suppress_velocity(field: &mut VelocityField, source_id: u64) {
    contribute_velocity(field, source_id, 0.0, 0.0);
}

// ---------------------------------------------------------------------------
// Loose constants
// ---------------------------------------------------------------------------

/// Sentinel frame id for a freshly-created sample, mirroring the TS `-1`. Using
/// `u64::MAX` keeps a never-touched sample stale even at frame 0.
const STALE_FRAME_ID: u64 = u64::MAX;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn zero() -> Velocity2D {
        Velocity2D { x: 0.0, y: 0.0 }
    }

    // begin_velocity_frame

    #[test]
    fn begin_velocity_frame_increments_frame_id() {
        let mut field = create_velocity_field();
        let before = field.frame_id;
        begin_velocity_frame(&mut field);
        assert_eq!(field.frame_id, before + 1);
    }

    // contribute_velocity

    #[test]
    fn contribute_velocity_stores_values_for_current_frame() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 1, 3.0, -4.0);
        let mut out = zero();
        get_velocity(&field, 1, &mut out);
        assert_eq!((out.x, out.y), (3.0, -4.0));
    }

    #[test]
    fn contribute_velocity_accepts_any_source_id() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 9999, 1.0, 2.0);
        let mut out = zero();
        get_velocity(&field, 9999, &mut out);
        assert_eq!((out.x, out.y), (1.0, 2.0));
    }

    // create_velocity_field

    #[test]
    fn create_velocity_field_starts_at_frame_zero() {
        let field = create_velocity_field();
        assert_eq!(field.frame_id, 0);
        let mut out = zero();
        get_velocity(&field, 1, &mut out);
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }

    // ensure_velocity_sample

    #[test]
    fn ensure_velocity_sample_inserts_when_missing() {
        let mut field = create_velocity_field();
        ensure_velocity_sample(&mut field, 1);
        assert!(field.samples.contains_key(&1));
    }

    #[test]
    fn ensure_velocity_sample_returns_existing() {
        let mut field = create_velocity_field();
        ensure_velocity_sample(&mut field, 1).velocity.x = 7.0;
        // A second call must return the same stored sample, not a fresh one.
        assert_eq!(ensure_velocity_sample(&mut field, 1).velocity.x, 7.0);
        assert_eq!(field.samples.len(), 1);
    }

    // get_velocity

    #[test]
    fn get_velocity_returns_zero_for_unknown_source() {
        let field = create_velocity_field();
        let mut out = Velocity2D { x: 5.0, y: 5.0 };
        get_velocity(&field, 42, &mut out);
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }

    #[test]
    fn get_velocity_returns_zero_for_stale_sample() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 1, 5.0, 5.0);
        begin_velocity_frame(&mut field);
        let mut out = zero();
        get_velocity(&field, 1, &mut out);
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }

    #[test]
    fn get_velocity_returns_contributed_value() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 1, 2.0, 8.0);
        let mut out = zero();
        get_velocity(&field, 1, &mut out);
        assert_eq!((out.x, out.y), (2.0, 8.0));
    }

    // has_velocity

    #[test]
    fn has_velocity_false_for_unknown_source() {
        let field = create_velocity_field();
        assert!(!has_velocity(&field, 1));
    }

    #[test]
    fn has_velocity_true_after_nonzero_contribution() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 1, 1.0, 0.0);
        assert!(has_velocity(&field, 1));
    }

    #[test]
    fn has_velocity_false_for_zero_contribution() {
        let mut field = create_velocity_field();
        suppress_velocity(&mut field, 1);
        assert!(!has_velocity(&field, 1));
    }

    // suppress_velocity

    #[test]
    fn suppress_velocity_zeroes_velocity_this_frame() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 1, 9.0, 9.0);
        suppress_velocity(&mut field, 1);
        let mut out = zero();
        get_velocity(&field, 1, &mut out);
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }
}
