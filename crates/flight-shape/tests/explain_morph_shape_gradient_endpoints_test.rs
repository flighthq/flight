use flight_shape::contract::*;

mod explain_morph_shape_gradient_endpoints {
    use super::*;

    fn endpoint(
        colors: Vec<u32>,
        alphas: Vec<f64>,
        ratios: Vec<f64>,
    ) -> MorphShapeGradientEndpoint {
        return MorphShapeGradientEndpoint {
            alphas,
            colors,
            focal_point_ratio: None,
            matrix: None,
            ratios,
        };
    }

    #[test]
    fn reports_an_empty_gradient_as_unsupported() {
        let empty = endpoint(Vec::new(), Vec::new(), Vec::new());
        let explanation = explain_morph_shape_gradient_endpoints(&empty, &empty);
        assert!(!explanation.supported);
        assert_eq!(
            explanation.reason,
            MorphShapeGradientEndpointReason::EmptyGradient
        );
    }

    #[test]
    fn reports_matching_stops_as_supported() {
        let start = endpoint(vec![0], vec![1.0], vec![0.0]);
        let end = endpoint(vec![0xffffffff], vec![0.0], vec![1.0]);
        assert!(explain_morph_shape_gradient_endpoints(&start, &end).supported);
    }
}

mod get_morph_shape_gradient_endpoint_issue {
    use super::*;

    fn endpoint(
        colors: Vec<u32>,
        alphas: Vec<f64>,
        ratios: Vec<f64>,
    ) -> MorphShapeGradientEndpoint {
        return MorphShapeGradientEndpoint {
            alphas,
            colors,
            focal_point_ratio: None,
            matrix: None,
            ratios,
        };
    }

    #[test]
    fn returns_stop_count_mismatch_for_different_lengths() {
        let start = endpoint(vec![0, 1], vec![1.0, 1.0], vec![0.0, 1.0]);
        let end = endpoint(vec![0], vec![1.0], vec![0.0]);
        assert_eq!(get_morph_shape_gradient_endpoint_issue(&start, &end), 4);
    }
}
