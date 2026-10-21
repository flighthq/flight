//! Channel-interpolation explanations (TS `explainSkeleton2DChannel.ts`).

use flight_animation::{AnimationChannel, AnimationInterpolation};

use crate::types::*;

/// Whether this channel's stated interpolation will be overridden, as plain data (TS
/// `explainSkeleton2DChannelInterpolation`).
pub fn explain_skeleton_2d_channel_interpolation(
    channel: &AnimationChannel,
    subject: &str,
) -> Option<Skeleton2DCoercedInterpolation> {
    if !is_skeleton_2d_stepped_channel_subject(subject) {
        return None;
    }
    let interpolation = channel.track.read().unwrap().interpolation;
    if interpolation == AnimationInterpolation::Step {
        return None;
    }
    return Some(Skeleton2DCoercedInterpolation {
        applied: String::from(STEP_INTERPOLATION),
        stated: String::from(interpolation_name(interpolation)),
        subject: String::from(subject),
    });
}

fn interpolation_name(value: AnimationInterpolation) -> &'static str {
    return match value {
        AnimationInterpolation::Cubic => "Cubic",
        AnimationInterpolation::Linear => "Linear",
        AnimationInterpolation::Step => "Step",
    };
}

/// Whether a channel family carries a value that cannot be blended (TS
/// `isSkeleton2DSteppedChannelSubject`).
pub fn is_skeleton_2d_stepped_channel_subject(subject: &str) -> bool {
    return subject == ATTACHMENT_SUBJECT || subject == DRAW_ORDER_SUBJECT;
}

const ATTACHMENT_SUBJECT: &str = "Attachment";
const DRAW_ORDER_SUBJECT: &str = "DrawOrder";
const STEP_INTERPOLATION: &str = "Step";
