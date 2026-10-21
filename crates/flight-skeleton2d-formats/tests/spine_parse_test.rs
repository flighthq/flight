use flight_entity::allocate_entity;
use flight_skeleton2d::contract::Slot2D;
use flight_skeleton2d_formats::contract::*;
use serde_json::json;

mod parse_spine_draw_order_timeline {
    use super::*;

    #[test]
    fn resolves_whole_orderings_and_drops_invalid_keyframes() {
        let slots = ["a", "b", "c"].map(|name| {
            let mut slot: Slot2D = allocate_entity();
            slot.name = Some(name.to_string());
            slot
        });
        let raw = json!([
            {"time":0,"offsets":[]},
            {"time":1,"offsets":[{"slot":"a","offset":2}]}
        ]);
        let timeline = parse_spine_draw_order_timeline(Some(&raw), &slots, None).unwrap();
        assert_eq!(timeline.times, [0.0, 1.0]);
        assert_eq!(timeline.orderings, [0.0, 1.0, 2.0, 2.0, 0.0, 1.0]);

        let invalid = json!([{"time":2,"offsets":[{"slot":"a","offset":9}]}]);
        let mut diagnostics = Vec::new();
        assert!(
            parse_spine_draw_order_timeline(Some(&invalid), &slots, Some(&mut diagnostics))
                .is_none()
        );
        assert_eq!(diagnostics[0].kind, "spine.draworder-keyframe-unresolved");
    }
}

mod parse_spine_skeleton_with_registry {
    use super::*;

    #[test]
    fn parses_registered_sections_and_leaves_unregistered_sections_empty() {
        let json = r#"{"bones":[{"name":"root"}],"slots":[{"name":"s","bone":"root"}]}"#;
        let empty =
            parse_spine_skeleton_with_registry(json, &create_spine_json_registry(), None).unwrap();
        assert!(empty.skeleton.bones.is_empty());

        let mut registry = create_spine_json_registry();
        register_all_spine_json_handlers(&mut registry);
        let parsed = parse_spine_skeleton_with_registry(json, &registry, None).unwrap();
        assert_eq!(parsed.skeleton.bones.len(), 1);
        assert_eq!(parsed.skeleton.slots.unwrap().len(), 1);
    }
}
