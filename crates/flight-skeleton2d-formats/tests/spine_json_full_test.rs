//! flight-compiler: target-native

use flight_skeleton2d_formats::contract::*;

mod parse_spine_skeleton {
    use super::*;

    #[test]
    fn installs_section_and_timeline_presets() {
        let json = r#"{"bones":[{"name":"root"}],"slots":[{"name":"s","bone":"root"}],"animations":{"walk":{"bones":{"root":{"rotate":[{"time":0,"value":0},{"time":1,"value":90}]}}}}}"#;
        let bare =
            parse_spine_skeleton_with_registry(json, &create_spine_json_registry(), None).unwrap();
        assert!(bare.skeleton.bones.is_empty());
        assert!(bare.animations.is_empty());

        let full = parse_spine_skeleton(json, None).unwrap();
        assert_eq!(full.skeleton.bones.len(), 1);
        assert_eq!(full.skeleton.slots.unwrap().len(), 1);
        assert_eq!(full.animations[0].clip.channels.len(), 1);
    }

    #[test]
    fn wires_rebased_curves_into_animation_tracks() {
        let json = r#"{"bones":[{"name":"root"}],"animations":{"walk":{"bones":{"root":{"rotate":[{"time":0,"value":0,"curve":[0.25,22.5,0.75,67.5]},{"time":1,"value":90}]}}}}}"#;
        let parsed = parse_spine_skeleton(json, None).unwrap();
        let track = parsed.animations[0].clip.channels[0].track.read().unwrap();
        assert!(track.segment_easings.as_ref().unwrap()[0].is_some());
    }

    #[test]
    fn keeps_bone_and_keyframe_numbers_as_exact_doubles() {
        // f32 spacing at 1e9 is 64, and 0.1 has no exact f32: both survive only as doubles.
        let json = r#"{"bones":[{"name":"root","x":1000000000.5}],"animations":{"walk":{"bones":{"root":{"rotate":[{"time":0.1,"value":0.1},{"time":1,"value":90}]}}}}}"#;
        let parsed = parse_spine_skeleton(json, None).unwrap();
        assert_eq!(parsed.skeleton.bones[0].x, 1_000_000_000.5);
        let track = parsed.animations[0].clip.channels[0].track.read().unwrap();
        assert_eq!(track.times[0], 0.1);
        assert_eq!(track.values[0], 0.1);
    }

    #[test]
    fn rejects_unreadable_input() {
        assert!(parse_spine_skeleton("{ nope", None).is_none());
        assert!(parse_spine_skeleton("null", None).is_none());
    }
}
