//! The report seams the skeleton's silent coercions report through (TS `skeleton2dGuards.ts`).

use crate::types::*;

/// Caller-owned guard slots (D5): the source's two module slots become explicit state. Installed
/// guards are replaced, not accumulated, so enabling twice installs one guard.
#[derive(Clone, Default)]
pub struct Skeleton2DGuardState {
    pub coerced_interpolation: Option<Skeleton2DCoercedInterpolationGuard>,
    pub deform_length: Option<Skeleton2DDeformLengthGuard>,
}

/// Reports a channel interpolation that was overridden (TS `reportSkeleton2DCoercedInterpolation`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global slots
pub fn report_skeleton_2d_coerced_interpolation(
    state: &Skeleton2DGuardState,
    subject: &str,
    stated: &str,
    applied: &str,
) {
    let Some(guard) = state.coerced_interpolation.as_ref() else {
        return;
    };
    guard(&Skeleton2DCoercedInterpolation {
        applied: String::from(applied),
        stated: String::from(stated),
        subject: String::from(subject),
    });
}

/// Reports a deform offset stream that does not match what it addresses (TS
/// `reportSkeleton2DDeformLengthMismatch`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global slots
pub fn report_skeleton_2d_deform_length_mismatch(
    state: &Skeleton2DGuardState,
    subject: &str,
    offsets: usize,
    addressed: usize,
) {
    let Some(guard) = state.deform_length.as_ref() else {
        return;
    };
    guard(&Skeleton2DDeformLengthMismatch {
        addressed,
        offsets,
        subject: String::from(subject),
    });
}

/// Installs or clears the coerced-interpolation guard (TS `setSkeleton2DCoercedInterpolationGuard`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global slots
pub fn set_skeleton_2d_coerced_interpolation_guard(
    state: &mut Skeleton2DGuardState,
    guard: Option<Skeleton2DCoercedInterpolationGuard>,
) {
    state.coerced_interpolation = guard;
}

/// Installs or clears the deform-length guard (TS `setSkeleton2DDeformLengthGuard`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global slots
pub fn set_skeleton_2d_deform_length_guard(
    state: &mut Skeleton2DGuardState,
    guard: Option<Skeleton2DDeformLengthGuard>,
) {
    state.deform_length = guard;
}
