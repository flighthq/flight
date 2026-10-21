use std::collections::HashMap;

use flight_scene2d_formats::{collect_lottie_counts, get_lottie_feature_names};
use serde_json::{Value, json};

mod collect_lottie_counts {
    use super::*;

    #[test]
    fn returns_none_for_invalid_json() {
        let mut counts = HashMap::from([("stale".to_string(), 7)]);
        assert!(!collect_lottie_counts(&mut counts, "not json"));
        assert!(counts.is_empty());
    }

    #[test]
    fn returns_none_for_non_lottie_json() {
        assert_eq!(counts(r#"{"armature":[]}"#), None);
        assert_eq!(counts(r#"{"foo":1}"#), None);
    }

    #[test]
    fn returns_none_when_fr_is_zero_or_missing() {
        assert_eq!(counts(r#"{"fr":0,"ip":0,"layers":[],"op":1}"#), None);
        assert_eq!(counts(r#"{"ip":0,"layers":[],"op":1}"#), None);
    }

    #[test]
    fn reports_every_mask_mode_the_document_asks_for_and_nothing_for_a_disabled_one() {
        let expected = [
            ("a", "mask.additive"),
            ("d", "mask.darken"),
            ("f", "mask.difference"),
            ("i", "mask.intersect"),
            ("l", "mask.lighten"),
            ("s", "mask.subtract"),
        ];
        for (mode, key) in expected {
            let mut keys = counts(&masked_document(mode))
                .unwrap()
                .into_keys()
                .collect::<Vec<_>>();
            keys.sort_unstable();
            let mut expected_keys = vec!["layer.null".to_string(), key.to_string()];
            expected_keys.sort_unstable();
            assert_eq!(keys, expected_keys, "{mode}");
        }
        assert_eq!(
            counts(&masked_document("n"))
                .unwrap()
                .into_keys()
                .collect::<Vec<_>>(),
            vec!["layer.null".to_string()]
        );
    }

    #[test]
    fn reports_an_inverted_mask_and_a_layer_carrying_several_active_masks_as_their_own_conditions()
    {
        assert_eq!(
            mask_counts(&[json!({"inv": true, "mode": "a"})]),
            HashMap::from([
                ("mask.additive".to_string(), 1),
                ("mask.inverted".to_string(), 1),
            ])
        );
        assert_eq!(
            mask_counts(&[json!({"mode": "a"}), json!({"mode": "a"})]),
            HashMap::from([
                ("mask.additive".to_string(), 2),
                ("mask.multiple".to_string(), 1),
            ])
        );
        assert_eq!(
            mask_counts(&[json!({"inv": true, "mode": "s"})]),
            HashMap::from([
                ("mask.inverted".to_string(), 1),
                ("mask.subtract".to_string(), 1),
            ])
        );
    }

    #[test]
    fn treats_a_disabled_mask_as_absent_when_deciding_both_conditions() {
        assert_eq!(
            mask_counts(&[json!({"mode": "a"}), json!({"mode": "n"})]),
            HashMap::from([("mask.additive".to_string(), 1)])
        );
        assert_eq!(
            mask_counts(&[json!({"mode": "n"}), json!({"mode": "n"})]),
            HashMap::new()
        );
        assert_eq!(
            mask_counts(&[json!({"inv": true, "mode": "n"})]),
            HashMap::new()
        );
    }

    #[test]
    fn returns_empty_counts_for_a_valid_document_with_no_layers() {
        let mut counts = HashMap::from([("stale".to_string(), 7)]);
        assert!(collect_lottie_counts(
            &mut counts,
            r#"{"fr":30,"ip":0,"layers":[],"op":60}"#,
        ));
        assert!(counts.is_empty());
    }

    #[test]
    fn counts_layer_kinds() {
        let document = json!({
            "fr": 30,
            "ip": 0,
            "layers": [{"ty": 4}, {"ty": 4}, {"ty": 1}, {"ty": 2}],
            "op": 60,
        });
        let counts = counts(&document.to_string()).unwrap();
        assert_eq!(counts.get("layer.shape"), Some(&2));
        assert_eq!(counts.get("layer.solid"), Some(&1));
        assert_eq!(counts.get("layer.image"), Some(&1));
    }

    #[test]
    fn counts_shape_items_within_shape_layers() {
        let document = json!({
            "fr": 30,
            "ip": 0,
            "layers": [{
                "shapes": [
                    {"ty": "sh"},
                    {"ty": "fl"},
                    {"ty": "gr", "it": [{"ty": "rc"}, {"ty": "st"}]},
                ],
                "ty": 4,
            }],
            "op": 60,
        });
        let counts = counts(&document.to_string()).unwrap();
        assert_eq!(counts.get("shape.path"), Some(&1));
        assert_eq!(counts.get("shape.fill"), Some(&1));
        assert_eq!(counts.get("shape.rectangle"), Some(&1));
        assert_eq!(counts.get("shape.stroke"), Some(&1));
    }
}

mod get_lottie_feature_names {
    use super::*;

    #[test]
    fn names_every_feature_the_census_can_emit_across_all_three_families() {
        let mut names = Vec::with_capacity(64);
        names.push("stale".to_string());
        let capacity = names.capacity();
        get_lottie_feature_names(&mut names);
        assert_eq!(names.capacity(), capacity);
        assert_eq!(names.len(), 23);
        let mut sorted = names.clone();
        sorted.sort_unstable();
        assert_eq!(names, sorted);
        assert_eq!(
            names
                .iter()
                .filter(|name| name.starts_with("layer."))
                .count(),
            6
        );
        assert_eq!(
            names
                .iter()
                .filter(|name| name.starts_with("mask."))
                .count(),
            8
        );
        assert_eq!(
            names
                .iter()
                .filter(|name| name.starts_with("shape."))
                .count(),
            9
        );
    }

    #[test]
    fn contains_every_key_a_document_can_actually_produce() {
        let document = json!({
            "fr": 30,
            "ip": 0,
            "layers": [
                {"ind": 1, "ip": 0, "masksProperties": [{"mode": "s", "o": {"k": 100}, "pt": {"k": {}}}], "op": 60, "ty": 3},
                {"ind": 2, "ip": 0, "op": 60, "shapes": [{"ty": "rc"}, {"ty": "fl"}, {"ty": "tm"}], "ty": 4},
            ],
            "op": 60,
        });
        let mut names = Vec::new();
        get_lottie_feature_names(&mut names);
        for key in counts(&document.to_string()).unwrap().into_keys() {
            assert!(names.contains(&key), "{key}");
        }
    }
}

fn mask_counts(masks: &[Value]) -> HashMap<String, usize> {
    let masks = masks
        .iter()
        .map(|mask| {
            let mut mask = mask.as_object().unwrap().clone();
            mask.insert("o".to_string(), json!({"k": 100}));
            mask.insert("pt".to_string(), json!({"k": {}}));
            Value::Object(mask)
        })
        .collect::<Vec<_>>();
    let document = json!({
        "fr": 30,
        "ip": 0,
        "layers": [{"ind": 1, "ip": 0, "masksProperties": masks, "op": 60, "ty": 3}],
        "op": 60,
    });
    return counts(&document.to_string())
        .unwrap()
        .into_iter()
        .filter(|(key, _)| key.starts_with("mask."))
        .collect();
}

fn masked_document(mode: &str) -> String {
    return json!({
        "fr": 30,
        "ip": 0,
        "layers": [{
            "ind": 1,
            "ip": 0,
            "masksProperties": [{"mode": mode, "o": {"k": 100}, "pt": {"k": {}}}],
            "op": 60,
            "ty": 3,
        }],
        "op": 60,
    })
    .to_string();
}

fn counts(source: &str) -> Option<HashMap<String, usize>> {
    let mut counts = HashMap::new();
    if !collect_lottie_counts(&mut counts, source) {
        return None;
    }
    return Some(counts);
}
