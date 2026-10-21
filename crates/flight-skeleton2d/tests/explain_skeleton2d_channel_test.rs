use flight_animation::{AnimationChannel, AnimationInterpolation, AnimationTrack};
use flight_skeleton2d::contract::*;

fn channel(interpolation: AnimationInterpolation) -> AnimationChannel {
    let mut track: AnimationTrack = flight_entity::allocate_entity();
    track.interpolation = interpolation;
    let mut out: AnimationChannel = flight_entity::allocate_entity();
    out.track = track;
    return out;
}

mod explain_skeleton_2d_channel_interpolation {
    use super::*;

    #[test]
    fn reports_the_override_a_non_step_attachment_channel_will_receive() {
        let report = explain_skeleton_2d_channel_interpolation(
            &channel(AnimationInterpolation::Linear),
            "Attachment",
        )
        .unwrap();
        assert_eq!(report.applied, "Step");
        assert_eq!(report.stated, "Linear");
        assert_eq!(report.subject, "Attachment");
    }

    #[test]
    fn reports_nothing_for_a_channel_already_authored_as_steps() {
        assert!(
            explain_skeleton_2d_channel_interpolation(
                &channel(AnimationInterpolation::Step),
                "Attachment"
            )
            .is_none()
        );
    }

    #[test]
    fn reports_nothing_for_a_blendable_family() {
        assert!(
            explain_skeleton_2d_channel_interpolation(
                &channel(AnimationInterpolation::Linear),
                "Transform"
            )
            .is_none()
        );
    }

    #[test]
    fn reports_the_override_for_a_draw_order_channel_too() {
        assert!(
            explain_skeleton_2d_channel_interpolation(
                &channel(AnimationInterpolation::Linear),
                "DrawOrder"
            )
            .is_some()
        );
    }
}

mod is_skeleton_2d_stepped_channel_subject {
    use super::*;

    #[test]
    fn names_the_families_that_cannot_blend() {
        assert!(is_skeleton_2d_stepped_channel_subject("Attachment"));
        assert!(is_skeleton_2d_stepped_channel_subject("DrawOrder"));
        assert!(!is_skeleton_2d_stepped_channel_subject("Transform"));
    }
}
