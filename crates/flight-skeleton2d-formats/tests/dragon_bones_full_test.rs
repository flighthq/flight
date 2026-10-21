use flight_skeleton2d_formats::contract::*;

mod parse_dragon_bones_skeleton {
    use super::*;

    #[test]
    fn installs_the_full_handler_preset() {
        let json = r#"{"version":"5.5","armature":[{"bone":[{"name":"root"}],"slot":[{"name":"s","parent":"root"}],"animation":[{"name":"walk"}]}]}"#;
        let bare =
            parse_dragon_bones_skeleton_with_registry(json, &create_dragon_bones_registry(), None)
                .unwrap();
        assert!(bare.skeleton.bones.is_empty());
        assert!(bare.animations.is_empty());

        let full = parse_dragon_bones_skeleton(json, None).unwrap();
        assert_eq!(full.skeleton.bones.len(), 1);
        assert_eq!(full.skeleton.slots.unwrap().len(), 1);
        assert_eq!(full.animations.len(), 1);
    }

    #[test]
    fn wires_authored_curves_into_animation_tracks() {
        let json = r#"{"version":"5.5","armature":[{"bone":[{"name":"root"}],"animation":[{"name":"a","bone":[{"name":"root","rotateFrame":[{"duration":1,"rotate":0,"curve":[0.25,0.1,0.75,0.9]},{"duration":1,"rotate":90}]}]}]}]}"#;
        let parsed = parse_dragon_bones_skeleton(json, None).unwrap();
        let track = parsed.animations[0].clip.channels[0].track.read().unwrap();
        assert!(track.segment_easings.as_ref().unwrap()[0].is_some());
    }

    #[test]
    fn rejects_unreadable_input() {
        assert!(parse_dragon_bones_skeleton("{ nope", None).is_none());
        assert!(parse_dragon_bones_skeleton("null", None).is_none());
    }
}
