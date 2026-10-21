use flight_hostcapability::contract::*;

const LAYERS: [(BackendExplanationLayer, &str); 4] = [
    (BackendExplanationLayer::Custom, "custom"),
    (BackendExplanationLayer::Host, "host"),
    (BackendExplanationLayer::HostNotEnabled, "host-not-enabled"),
    (BackendExplanationLayer::NoHostImplementation, "no-host-implementation"),
];

const VIABILITIES: [(BackendExplanationViability, &str); 3] = [
    (BackendExplanationViability::Available, "available"),
    (BackendExplanationViability::RuntimeApiUnavailable, "runtime-api-unavailable"),
    (BackendExplanationViability::Unobserved, "unobserved"),
];

mod backend_explanation {
    use super::*;

    #[test]
    fn is_plain_data_whose_operation_may_be_absent() {
        let explanation = BackendExplanation {
            conflict: false,
            layer: BackendExplanationLayer::HostNotEnabled,
            operation: None,
            viability: BackendExplanationViability::Unobserved,
        };
        assert_eq!(explanation.clone(), explanation);
        assert_ne!(explanation, BackendExplanation { operation: Some("read".to_string()), ..explanation.clone() });
    }
}

mod get_backend_explanation_layer_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        for (value, text) in LAYERS {
            assert_eq!(get_backend_explanation_layer_string(value), text);
        }
    }
}

mod get_backend_explanation_viability_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        for (value, text) in VIABILITIES {
            assert_eq!(get_backend_explanation_viability_string(value), text);
        }
    }
}

mod parse_backend_explanation_layer {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        for (value, text) in LAYERS {
            assert_eq!(parse_backend_explanation_layer(text), Some(value));
        }
    }

    #[test]
    fn rejects_the_operation_layer_vocabulary_and_other_text() {
        assert_eq!(parse_backend_explanation_layer("sentinel"), None);
        assert_eq!(parse_backend_explanation_layer("none"), None);
        assert_eq!(parse_backend_explanation_layer("Host"), None);
        assert_eq!(parse_backend_explanation_layer(""), None);
    }
}

mod parse_backend_explanation_viability {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        for (value, text) in VIABILITIES {
            assert_eq!(parse_backend_explanation_viability(text), Some(value));
        }
    }

    #[test]
    fn rejects_other_text() {
        assert_eq!(parse_backend_explanation_viability("unavailable"), None);
        assert_eq!(parse_backend_explanation_viability(""), None);
    }
}
