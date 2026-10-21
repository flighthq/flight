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

mod gradient_endpoint_source_parity {
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
    fn reports_compatible_equal_length_gradient_stops() {
        let explanation = explain_morph_shape_gradient_endpoints(
            &endpoint(vec![0x000000ff], vec![1.0], vec![0.0]),
            &endpoint(vec![0xffffffff], vec![1.0], vec![255.0]),
        );
        assert_eq!(
            explanation,
            MorphShapeGradientEndpointExplanation {
                end_stop_count: 1,
                reason: MorphShapeGradientEndpointReason::Ok,
                start_stop_count: 1,
                supported: true
            }
        );
    }

    #[test]
    fn reports_each_incompatible_topology_reason() {
        let empty = endpoint(Vec::new(), Vec::new(), Vec::new());
        assert_eq!(
            explain_morph_shape_gradient_endpoints(&empty, &empty).reason,
            MorphShapeGradientEndpointReason::EmptyGradient
        );

        let start_bad = explain_morph_shape_gradient_endpoints(
            &MorphShapeGradientEndpoint {
                alphas: Vec::new(),
                colors: vec![0x000000ff],
                focal_point_ratio: None,
                matrix: None,
                ratios: vec![0.0],
            },
            &endpoint(vec![0x000000ff], vec![1.0], vec![0.0]),
        );
        assert_eq!(
            start_bad.reason,
            MorphShapeGradientEndpointReason::StartStopComponentCountMismatch
        );

        let end_bad = explain_morph_shape_gradient_endpoints(
            &endpoint(vec![0x000000ff], vec![1.0], vec![0.0]),
            &MorphShapeGradientEndpoint {
                alphas: Vec::new(),
                colors: vec![0x000000ff],
                focal_point_ratio: None,
                matrix: None,
                ratios: vec![0.0],
            },
        );
        assert_eq!(
            end_bad.reason,
            MorphShapeGradientEndpointReason::EndStopComponentCountMismatch
        );

        let count_bad = explain_morph_shape_gradient_endpoints(
            &endpoint(vec![0x000000ff], vec![1.0], vec![0.0]),
            &endpoint(
                vec![0x000000ff, 0xffffffff],
                vec![1.0, 1.0],
                vec![0.0, 255.0],
            ),
        );
        assert_eq!(
            count_bad.reason,
            MorphShapeGradientEndpointReason::StopCountMismatch
        );
        assert!(!count_bad.supported);
    }

    #[test]
    fn get_issue_provides_a_string_free_compatibility_seam() {
        assert_eq!(
            get_morph_shape_gradient_endpoint_issue(
                &endpoint(vec![0x000000ff], vec![1.0], vec![0.0]),
                &endpoint(vec![0xffffffff], vec![1.0], vec![255.0]),
            ),
            0
        );
    }
}
