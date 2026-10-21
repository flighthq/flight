use std::sync::Arc;

use flight_skeleton2d::contract::create_skeleton_2d;
use flight_skeleton2d_formats::contract::*;

mod get_skeleton_2d_format_kinds {
    use super::*;

    #[test]
    fn returns_a_sorted_snapshot() {
        let kinds = get_skeleton_2d_format_kinds();
        assert!(kinds.windows(2).all(|pair| pair[0] <= pair[1]));
        assert!(kinds.contains(&"DragonBones".to_string()));
        assert!(kinds.contains(&"Spine".to_string()));
    }
}

mod parse_skeleton_2d {
    use super::*;

    #[test]
    fn auto_detects_both_json_formats() {
        let spine = parse_skeleton_2d(r#"{"bones":[{"name":"root"}]}"#, None).unwrap();
        assert_eq!(spine.skeleton.bones[0].name.as_deref(), Some("root"));
        let dragon = parse_skeleton_2d(
            r#"{"version":"5.5","armature":[{"bone":[{"name":"root"}]}]}"#,
            None,
        )
        .unwrap();
        assert_eq!(dragon.skeleton.bones[0].name.as_deref(), Some("root"));
        assert!(parse_skeleton_2d("not a skeleton", None).is_none());
    }
}

mod register_skeleton_2d_format {
    use super::*;

    #[test]
    fn dispatches_custom_formats_and_is_last_write_wins() {
        register_skeleton_2d_format(
            "test.CustomRig",
            Arc::new(|text| text == "CUSTOM"),
            Arc::new(|_, _| {
                Some(Skeleton2DImport {
                    animations: Vec::new(),
                    skeleton: create_skeleton_2d(Vec::new(), None),
                })
            }),
        );
        assert!(parse_skeleton_2d("CUSTOM", None).is_some());
        unregister_skeleton_2d_format("test.CustomRig");
    }
}

mod unregister_skeleton_2d_format {
    use super::*;

    #[test]
    fn prevents_later_dispatch() {
        register_skeleton_2d_format(
            "test.RemovedRig",
            Arc::new(|text| text == "REMOVED"),
            Arc::new(|_, _| None),
        );
        unregister_skeleton_2d_format("test.RemovedRig");
        assert!(parse_skeleton_2d("REMOVED", None).is_none());
    }
}
