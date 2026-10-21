use std::collections::HashMap;
use std::sync::Arc;

use flight_skeleton2d_formats::contract::*;

mod analyze_skeleton_2d_json {
    use super::*;

    #[test]
    fn identifies_builtins_and_rejects_unrelated_json() {
        assert!(analyze_skeleton_2d_json("not-json").is_none());
        assert!(analyze_skeleton_2d_json("null").is_none());
        assert!(analyze_skeleton_2d_json(r#"{"type":"lottie"}"#).is_none());
        let spine = analyze_skeleton_2d_json(r#"{"bones":[{}]}"#).unwrap();
        assert_eq!(spine.format, "spine-json");
        assert_eq!(spine.counts.get("bones"), Some(&1));
        let dragon = analyze_skeleton_2d_json(r#"{"armature":[{"bone":[{}]}]}"#).unwrap();
        assert_eq!(dragon.format, "dragonbones");
    }
}

mod register_skeleton_2d_json_analyzer {
    use super::*;

    #[test]
    fn adds_and_overrides_a_custom_analyzer_in_place() {
        register_skeleton_2d_json_analyzer(
            "test.custom-a",
            Arc::new(|record| record.get("customA").is_some()),
            Arc::new(|_| HashMap::from([("first".to_string(), 1)])),
        );
        register_skeleton_2d_json_analyzer(
            "test.custom-a",
            Arc::new(|record| record.get("customA").is_some()),
            Arc::new(|_| HashMap::from([("second".to_string(), 2)])),
        );
        let result = analyze_skeleton_2d_json(r#"{"customA":true}"#).unwrap();
        assert_eq!(result.counts.get("second"), Some(&2));
        assert!(unregister_skeleton_2d_json_analyzer("test.custom-a"));
    }
}

mod unregister_skeleton_2d_json_analyzer {
    use super::*;

    #[test]
    fn reports_whether_the_entry_existed() {
        assert!(!unregister_skeleton_2d_json_analyzer("test.missing"));
        register_skeleton_2d_json_analyzer(
            "test.removable",
            Arc::new(|_| false),
            Arc::new(|_| HashMap::new()),
        );
        assert!(unregister_skeleton_2d_json_analyzer("test.removable"));
        assert!(!unregister_skeleton_2d_json_analyzer("test.removable"));
    }
}
