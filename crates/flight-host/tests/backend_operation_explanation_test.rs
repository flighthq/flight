use flight_host::contract::*;

const LAYERS: [(BackendOperationExplanationLayer, &str); 4] = [
    (BackendOperationExplanationLayer::Custom, "custom"),
    (BackendOperationExplanationLayer::Host, "host"),
    (BackendOperationExplanationLayer::None, "none"),
    (BackendOperationExplanationLayer::Sentinel, "sentinel"),
];

mod backend_operation_explanation {
    use super::*;

    #[test]
    fn distinguishes_an_absent_implementation_from_a_sentinel() {
        let sentinel = BackendOperationExplanation {
            implemented: false,
            layer: BackendOperationExplanationLayer::Sentinel,
            operation: "getAccessoryBarVisible".to_string(),
        };
        let absent = BackendOperationExplanation { layer: BackendOperationExplanationLayer::None, ..sentinel.clone() };
        assert!(!sentinel.implemented && !absent.implemented);
        assert_ne!(sentinel, absent);
    }
}

mod get_backend_operation_explanation_layer_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        for (value, text) in LAYERS {
            assert_eq!(get_backend_operation_explanation_layer_string(value), text);
        }
    }

    #[test]
    fn keeps_none_and_sentinel_distinct() {
        assert_ne!(
            get_backend_operation_explanation_layer_string(BackendOperationExplanationLayer::None),
            get_backend_operation_explanation_layer_string(BackendOperationExplanationLayer::Sentinel)
        );
    }
}

mod parse_backend_operation_explanation_layer {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        for (value, text) in LAYERS {
            assert_eq!(parse_backend_operation_explanation_layer(text), Some(value));
        }
    }

    #[test]
    fn rejects_the_backend_layer_vocabulary_and_other_text() {
        assert_eq!(parse_backend_operation_explanation_layer("host-not-enabled"), None);
        assert_eq!(parse_backend_operation_explanation_layer("no-host-implementation"), None);
        assert_eq!(parse_backend_operation_explanation_layer("Sentinel"), None);
        assert_eq!(parse_backend_operation_explanation_layer(""), None);
    }
}
