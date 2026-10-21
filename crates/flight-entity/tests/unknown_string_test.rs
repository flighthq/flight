use std::sync::Arc;

use flight_entity::*;

mod unknown_to_js_string {
    use super::*;

    fn stringify_optional(value: Option<&Unknown>) -> String {
        return match value {
            Some(value) => unknown_to_js_string(value),
            None => "undefined".to_string(),
        };
    }

    #[test]
    fn distinguishes_explicit_null_from_an_omitted_outer_option() {
        let explicit_null: Unknown = None;
        assert_eq!(stringify_optional(Some(&explicit_null)), "null");
        assert_eq!(stringify_optional(None), "undefined");
    }

    #[test]
    fn formats_flight_errors_with_javascript_error_to_string_rules() {
        let error: Unknown = Some(Arc::new(FlightError {
            kind: FlightErrorKind::TypeError,
            message: "invalid value".to_string(),
        }));
        let empty_message: Unknown = Some(Arc::new(FlightError {
            kind: FlightErrorKind::RangeError,
            message: String::new(),
        }));

        assert_eq!(unknown_to_js_string(&error), "TypeError: invalid value");
        assert_eq!(unknown_to_js_string(&empty_message), "RangeError");
    }

    #[test]
    fn formats_numeric_concrete_types_as_javascript_numbers() {
        assert_eq!(unknown_to_js_string(&Some(Arc::new(7_i8))), "7");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(-8_i16))), "-8");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(9_i32))), "9");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(-10_i64))), "-10");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(11_isize))), "11");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(12_u8))), "12");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(13_u16))), "13");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(14_u32))), "14");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(15_u64))), "15");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(16_usize))), "16");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(17.5_f32))), "17.5");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(18.25_f64))), "18.25");
    }

    #[test]
    fn matches_javascript_number_edge_spellings() {
        assert_eq!(unknown_to_js_string(&Some(Arc::new(f64::NAN))), "NaN");
        assert_eq!(
            unknown_to_js_string(&Some(Arc::new(f64::INFINITY))),
            "Infinity"
        );
        assert_eq!(
            unknown_to_js_string(&Some(Arc::new(f64::NEG_INFINITY))),
            "-Infinity"
        );
        assert_eq!(unknown_to_js_string(&Some(Arc::new(-0.0_f64))), "0");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(3.0_f64))), "3");
        assert_eq!(
            unknown_to_js_string(&Some(Arc::new(1_000_000_000_000_000_000_000_f64))),
            "1e+21"
        );
        assert_eq!(unknown_to_js_string(&Some(Arc::new(0.0000001_f64))), "1e-7");
    }

    #[test]
    fn preserves_string_text_and_boolean_spelling() {
        let owned: Unknown = Some(Arc::new("owned text".to_string()));
        let borrowed: Unknown = Some(Arc::new("borrowed text" as &'static str));
        assert_eq!(unknown_to_js_string(&owned), "owned text");
        assert_eq!(unknown_to_js_string(&borrowed), "borrowed text");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(true))), "true");
        assert_eq!(unknown_to_js_string(&Some(Arc::new(false))), "false");
    }

    #[test]
    fn uses_the_plain_object_fallback_without_debug_or_custom_stringification() {
        #[derive(Debug)]
        struct OpaqueObject(&'static str);

        let value: Unknown = Some(Arc::new(OpaqueObject("must not leak")));
        assert_eq!(unknown_to_js_string(&value), "[object Object]");
        assert_eq!(
            value
                .as_ref()
                .unwrap()
                .downcast_ref::<OpaqueObject>()
                .unwrap()
                .0,
            "must not leak"
        );
    }
}
