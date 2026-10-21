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
    fn rejects_unreadable_input() {
        assert!(parse_spine_skeleton("{ nope", None).is_none());
        assert!(parse_spine_skeleton("null", None).is_none());
    }
}
