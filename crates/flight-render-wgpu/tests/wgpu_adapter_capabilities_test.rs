use flight_render_wgpu::*;

use crate::support::*;

// The source fakes a `GPUAdapter` literal; here a real noop adapter reports exactly the features and
// limits each case configures.
fn make_adapter(features: wgpu::Features, limits: Option<wgpu::Limits>) -> wgpu::Adapter {
    return create_test_adapter(features, limits);
}

mod get_wgpu_adapter_capabilities {
    use super::*;

    #[test]
    fn returns_false_for_supports_float32_filterable_when_feature_is_absent() {
        let caps = get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::empty(), None));
        assert!(!caps.supports_float32_filterable);
    }

    #[test]
    fn returns_true_for_supports_float32_filterable_when_feature_is_present() {
        let caps =
            get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::FLOAT32_FILTERABLE, None));
        assert!(caps.supports_float32_filterable);
    }

    #[test]
    fn returns_false_for_supports_timestamp_query_when_feature_is_absent() {
        let caps = get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::empty(), None));
        assert!(!caps.supports_timestamp_query);
    }

    #[test]
    fn returns_true_for_supports_timestamp_query_when_feature_is_present() {
        let caps =
            get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::TIMESTAMP_QUERY, None));
        assert!(caps.supports_timestamp_query);
    }

    #[test]
    fn reads_max_texture_dimension_2d_from_adapter_limits() {
        let limits = wgpu::Limits {
            max_texture_dimension_2d: 16384,
            ..test_default()
        };
        let caps =
            get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::empty(), Some(limits)));
        assert_eq!(caps.max_texture_dimension_2d, 16384);
    }

    // wgpu limits are never absent: an adapter that states no limit reports wgpu's default, which is
    // the source's 8192 fallback.
    #[test]
    fn falls_back_to_8192_when_max_texture_dimension_2d_is_absent_from_limits() {
        let caps = get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::empty(), None));
        assert_eq!(caps.max_texture_dimension_2d, 8192);
    }

    #[test]
    fn reports_max_sample_count_of_4() {
        let caps = get_wgpu_adapter_capabilities(&make_adapter(wgpu::Features::empty(), None));
        assert_eq!(caps.max_sample_count, 4);
    }
}
