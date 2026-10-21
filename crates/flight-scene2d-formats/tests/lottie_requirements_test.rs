use flight_scene2d_formats::{is_readable_lottie, parse_lottie_requirements};
use serde_json::json;

mod is_readable_lottie {
    use super::*;

    #[test]
    fn returns_false_for_non_lottie_json() {
        assert!(!is_readable_lottie(r#"{"armature":[]}"#));
        assert!(!is_readable_lottie("not json"));
    }

    #[test]
    fn returns_true_for_a_valid_lottie_document() {
        assert!(is_readable_lottie(
            r#"{"fr":30,"ip":0,"layers":[],"op":60}"#
        ));
    }
}

mod parse_lottie_requirements {
    use super::*;

    #[test]
    fn emits_a_requirement_for_each_counted_kind() {
        let document = json!({
            "fr": 30,
            "ip": 0,
            "layers": [{"shapes": [{"ty": "sh"}, {"ty": "fl"}], "ty": 4}],
            "op": 60,
        });
        let result = parse_lottie_requirements(&document.to_string());
        let keys = result
            .requirements
            .iter()
            .map(|requirement| requirement.key.as_str())
            .collect::<Vec<_>>();
        assert!(keys.contains(&"lottie.layer.shape"));
        assert!(keys.contains(&"lottie.shape.path"));
        assert!(keys.contains(&"lottie.shape.fill"));
    }
}
