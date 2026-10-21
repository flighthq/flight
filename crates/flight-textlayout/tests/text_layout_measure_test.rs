use std::sync::Arc;

use crate::common::empty_text_format;
use flight_textlayout::contract::*;

fn host(measure: TextMeasureFunction) -> HostTextShaperCapability {
    return HostTextShaperCapability {
        provider: Arc::new(()),
        get_code_point_for_glyph: None,
        get_font_metrics: None,
        get_glyph_extents: None,
        get_glyph_index_for_code_point: None,
        get_glyph_name: None,
        measure_text: measure,
        shape_run: None,
    };
}

mod create_text_layout_measure_state {
    use super::*;

    #[test]
    fn creates_caller_owned_empty_state() {
        let state = create_text_layout_measure_state();
        assert!(get_text_layout_measure_provider(&state, None).is_none());
    }
}

mod get_text_layout_measure_provider {
    use super::*;

    #[test]
    fn prefers_an_explicitly_set_provider_over_the_host_text_shaper() {
        let explicit: TextMeasureFunction = Arc::new(|text, _| text.len() as f32 * 10.0);
        let backend = host(Arc::new(|_, _| 99.0));
        let mut state = create_text_layout_measure_state();
        set_text_layout_measure_provider(&mut state, Some(explicit.clone()));
        let measure = get_text_layout_measure_provider(&state, Some(&backend)).unwrap();
        assert!(Arc::ptr_eq(&measure, &explicit));
    }

    #[test]
    fn returns_a_bound_measure_function_when_a_host_text_shaper_is_provided() {
        let backend = host(Arc::new(|text, _| text.len() as f32));
        let state = create_text_layout_measure_state();
        let measure = get_text_layout_measure_provider(&state, Some(&backend)).unwrap();
        assert_eq!(measure("abc", &empty_text_format()), 3.0);
    }

    #[test]
    fn returns_none_before_a_provider_or_host_text_shaper_is_supplied() {
        let state = create_text_layout_measure_state();
        assert!(get_text_layout_measure_provider(&state, None).is_none());
    }
}

mod set_text_layout_measure_provider {
    use super::*;

    #[test]
    fn stores_the_provider_and_clears_it_with_none() {
        let explicit: TextMeasureFunction = Arc::new(|text, _| text.len() as f32);
        let mut state = create_text_layout_measure_state();
        set_text_layout_measure_provider(&mut state, Some(explicit.clone()));
        let stored = get_text_layout_measure_provider(&state, None).unwrap();
        assert!(Arc::ptr_eq(&stored, &explicit));
        set_text_layout_measure_provider(&mut state, None);
        assert!(get_text_layout_measure_provider(&state, None).is_none());
    }
}
