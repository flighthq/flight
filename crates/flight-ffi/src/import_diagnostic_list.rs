// Pins the caller-owned list the build script generates for `Option<&mut Vec<ImportDiagnostic>>`
// parameters: NULL collects nothing, a list collects by appending, and every read is by index.

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::ffi::{CString, c_char};

    use crate::*;

    const COCOS_UNRECOGNIZED_FRAME: &str =
        "<plist><dict><key>frames</key><dict><key>a.png</key><dict></dict></dict></dict></plist>";
    const STARLING_WITHOUT_DIMENSIONS: &str = "<TextureAtlas imagePath=\"a.png\"></TextureAtlas>";

    fn parse_starling(list: *mut FfiImportDiagnosticList) {
        let xml = CString::new(STARLING_WITHOUT_DIMENSIONS).unwrap();
        let data =
            unsafe { flight_parse_starling_spritesheet(xml.as_ptr(), std::ptr::null(), list) };
        assert!(!data.is_null());
        unsafe { flight_free_spritesheet_data(data) };
    }

    fn take_c_string(text: *mut c_char) -> String {
        assert!(!text.is_null());
        return unsafe { CString::from_raw(text) }.into_string().unwrap();
    }

    // A diagnostic carrying one detail value of each kind, pushed through the wrapper-side borrow.
    fn with_mixed_detail(list: *mut FfiImportDiagnosticList) {
        let mut detail = HashMap::new();
        detail.insert(
            "count".to_string(),
            flight_sdk::ImportDiagnosticDetailValue::Number(2.5),
        );
        detail.insert(
            "Zed".to_string(),
            flight_sdk::ImportDiagnosticDetailValue::Bool(true),
        );
        detail.insert(
            "name".to_string(),
            flight_sdk::ImportDiagnosticDetailValue::String("x".to_string()),
        );
        flight_sdk::report_import_diagnostic(
            Some(unsafe { ffi_import_diagnostic_list_values(list) }),
            flight_sdk::ImportDiagnosticSeverity::Skip,
            "test.kind",
            "origin",
            Some(detail),
        );
    }

    mod flight_clear_import_diagnostic_list {
        use super::*;

        #[test]
        fn empties_a_list_for_reuse_and_ignores_null() {
            let list = unsafe { flight_create_import_diagnostic_list() };
            parse_starling(list);
            parse_starling(list);
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 2);
            unsafe { flight_clear_import_diagnostic_list(list) };
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 0);
            parse_starling(list);
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 1);
            unsafe { flight_clear_import_diagnostic_list(std::ptr::null_mut()) };
            unsafe { flight_destroy_import_diagnostic_list(list) };
        }
    }

    mod flight_create_import_diagnostic_list {
        use super::*;

        #[test]
        fn starts_empty_with_empty_reads() {
            let list = unsafe { flight_create_import_diagnostic_list() };
            assert!(!list.is_null());
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 0);
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_severity(list, 0) },
                -1
            );
            assert!(unsafe { flight_get_import_diagnostic_list_kind(list, 0) }.is_null());
            assert!(unsafe { flight_get_import_diagnostic_list_message(list, 0) }.is_null());
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_length(list, 0) },
                0
            );
            unsafe { flight_destroy_import_diagnostic_list(list) };
        }
    }

    mod flight_destroy_import_diagnostic_list {
        use super::*;

        #[test]
        fn ignores_null() {
            unsafe { flight_destroy_import_diagnostic_list(std::ptr::null_mut()) };
        }
    }

    mod flight_get_import_diagnostic_list_detail_kind {
        use super::*;

        #[test]
        fn reads_each_detail_value_in_utf16_key_order() {
            let list = unsafe { flight_create_import_diagnostic_list() };
            with_mixed_detail(list);
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_length(list, 0) },
                3
            );
            let keys: Vec<String> = (0..3)
                .map(|detail| {
                    take_c_string(unsafe {
                        flight_get_import_diagnostic_list_detail_key(list, 0, detail)
                    })
                })
                .collect();
            assert_eq!(keys, ["Zed", "count", "name"]);
            let kinds: Vec<i32> = (0..4)
                .map(|detail| unsafe {
                    flight_get_import_diagnostic_list_detail_kind(list, 0, detail)
                })
                .collect();
            assert_eq!(kinds, [0, 1, 2, -1]);
            assert!(unsafe { flight_get_import_diagnostic_list_detail_bool(list, 0, 0) });
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_number(list, 0, 1) },
                2.5
            );
            assert_eq!(
                take_c_string(unsafe {
                    flight_get_import_diagnostic_list_detail_string(list, 0, 2)
                }),
                "x"
            );
            // A read of the wrong kind, or past the end, is the empty value.
            assert!(!unsafe { flight_get_import_diagnostic_list_detail_bool(list, 0, 1) });
            assert!(
                unsafe { flight_get_import_diagnostic_list_detail_number(list, 0, 0) }.is_nan()
            );
            assert!(
                unsafe { flight_get_import_diagnostic_list_detail_string(list, 0, 0) }.is_null()
            );
            assert!(unsafe { flight_get_import_diagnostic_list_detail_key(list, 0, 3) }.is_null());
            unsafe { flight_destroy_import_diagnostic_list(list) };
        }
    }

    mod flight_get_import_diagnostic_list_length {
        use super::*;

        #[test]
        fn reads_zero_from_null_and_from_another_handle_type() {
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_length(std::ptr::null()) },
                0
            );
            let other = Box::into_raw(Box::new(FfiImportDiagnosticList {
                tag: 0,
                values: Vec::new(),
            }));
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_length(other) },
                0
            );
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_severity(other, 0) },
                -1
            );
            drop(unsafe { Box::from_raw(other) });
        }
    }

    mod flight_parse_cocos_plist_spritesheet {
        use super::*;

        #[test]
        fn collects_a_dropped_frame_with_its_detail() {
            let xml = CString::new(COCOS_UNRECOGNIZED_FRAME).unwrap();
            let list = unsafe { flight_create_import_diagnostic_list() };
            let data = unsafe { flight_parse_cocos_plist_spritesheet(xml.as_ptr(), list) };
            unsafe { flight_free_spritesheet_data(data) };
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 1);
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_severity(list, 0) },
                0
            );
            assert_eq!(
                take_c_string(unsafe { flight_get_import_diagnostic_list_kind(list, 0) }),
                "spritesheet.cocos-plist.unrecognized-frame"
            );
            assert_eq!(
                take_c_string(unsafe { flight_get_import_diagnostic_list_origin(list, 0) }),
                "parseCocosPlistXml"
            );
            assert_eq!(
                take_c_string(unsafe { flight_get_import_diagnostic_list_message(list, 0) }),
                "Drop parseCocosPlistXml: spritesheet.cocos-plist.unrecognized-frame frame=a.png"
            );
            assert_eq!(
                take_c_string(unsafe { flight_get_import_diagnostic_list_detail_key(list, 0, 0) }),
                "frame"
            );
            assert_eq!(
                take_c_string(unsafe {
                    flight_get_import_diagnostic_list_detail_string(list, 0, 0)
                }),
                "a.png"
            );
            unsafe { flight_destroy_import_diagnostic_list(list) };
        }
    }

    mod flight_parse_starling_spritesheet {
        use super::*;

        #[test]
        fn collects_nothing_into_a_null_list() {
            parse_starling(std::ptr::null_mut());
        }

        #[test]
        fn collects_a_detail_free_diagnostic() {
            let list = unsafe { flight_create_import_diagnostic_list() };
            parse_starling(list);
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 1);
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_severity(list, 0) },
                1
            );
            assert_eq!(
                take_c_string(unsafe { flight_get_import_diagnostic_list_kind(list, 0) }),
                "spritesheet.starling.missing-dimensions"
            );
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_length(list, 0) },
                0
            );
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_kind(list, 0, 0) },
                -1
            );
            unsafe { flight_destroy_import_diagnostic_list(list) };
        }
    }
}
