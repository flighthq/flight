// Pins the caller-owned list the build script generates for `Option<&mut Vec<ImportDiagnostic>>`
// parameters: NULL collects nothing, a list collects by appending, every read is by index, and a
// handle of another type is never read, mutated or released as a list.

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::ffi::{CString, c_char};

    use crate::*;

    const COCOS_UNRECOGNIZED_FRAME: &str =
        "<plist><dict><key>frames</key><dict><key>a.png</key><dict></dict></dict></dict></plist>";
    fn parse_cocos(list: *mut FfiImportDiagnosticList) {
        let xml = CString::new(COCOS_UNRECOGNIZED_FRAME).unwrap();
        let data = unsafe { flight_parse_cocos_plist_spritesheet(xml.as_ptr(), list) };
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
            unsafe { ffi_import_diagnostic_list_values(list) },
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
            parse_cocos(list);
            parse_cocos(list);
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 2);
            unsafe { flight_clear_import_diagnostic_list(list) };
            assert_eq!(unsafe { flight_get_import_diagnostic_list_length(list) }, 0);
            parse_cocos(list);
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

        #[test]
        fn unregisters_the_list_it_releases() {
            let list = unsafe { flight_create_import_diagnostic_list() };
            unsafe { flight_destroy_import_diagnostic_list(list) };
            assert!(!is_ffi_import_diagnostic_list(list));
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

        // A child process runs the in-process test alone, so an abort at the C ABI is an exit status
        // here instead of the end of the whole test binary.
        #[test]
        fn never_aborts_on_another_handle_type() {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "import_diagnostic_list::tests::flight_get_import_diagnostic_list_length::treats_another_handle_type_as_no_list",
                    "--test-threads=1",
                    "--nocapture",
                ])
                .output()
                .unwrap();
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            assert_ne!(output.status.code(), Some(134), "{stderr}");
            assert!(
                !stderr.contains("panic in a function that cannot unwind"),
                "{stderr}"
            );
            assert!(!stderr.contains("panicked"), "{stderr}");
            assert!(output.status.success(), "{stdout}{stderr}");
            assert!(stdout.contains("1 passed"), "{stdout}");
        }

        #[test]
        fn reads_zero_from_null() {
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_length(std::ptr::null()) },
                0
            );
        }

        // A live Vec<Ref<AppWindow>> handle passed where a list belongs: every entry point treats it as
        // no list, and the handle's own helpers still read and release it normally afterwards.
        #[test]
        fn treats_another_handle_type_as_no_list() {
            let windows = unsafe { flight_vec_ref_app_window_create() };
            let alternate = windows.cast::<FfiImportDiagnosticList>();
            parse_cocos(alternate);
            let xml = CString::new(COCOS_UNRECOGNIZED_FRAME).unwrap();
            let data = unsafe { flight_parse_cocos_plist_spritesheet(xml.as_ptr(), alternate) };
            unsafe { flight_free_spritesheet_data(data) };
            unsafe { flight_clear_import_diagnostic_list(alternate) };
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_length(alternate) },
                0
            );
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_severity(alternate, 0) },
                -1
            );
            assert!(unsafe { flight_get_import_diagnostic_list_kind(alternate, 0) }.is_null());
            assert!(unsafe { flight_get_import_diagnostic_list_origin(alternate, 0) }.is_null());
            assert!(unsafe { flight_get_import_diagnostic_list_message(alternate, 0) }.is_null());
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_length(alternate, 0) },
                0
            );
            assert!(
                unsafe { flight_get_import_diagnostic_list_detail_key(alternate, 0, 0) }.is_null()
            );
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_kind(alternate, 0, 0) },
                -1
            );
            assert!(!unsafe { flight_get_import_diagnostic_list_detail_bool(alternate, 0, 0) });
            assert!(
                unsafe { flight_get_import_diagnostic_list_detail_number(alternate, 0, 0) }
                    .is_nan()
            );
            assert!(
                unsafe { flight_get_import_diagnostic_list_detail_string(alternate, 0, 0) }
                    .is_null()
            );
            unsafe { flight_destroy_import_diagnostic_list(alternate) };
            assert_eq!(unsafe { flight_vec_ref_app_window_len(windows) }, 0);
            assert!(unsafe { flight_vec_ref_app_window_get(windows, 0) }.is_null());
            unsafe { flight_vec_ref_app_window_free(windows) };
        }
    }

    mod flight_parse_cocos_plist_spritesheet_null_and_kind {
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

    mod flight_parse_cocos_plist_spritesheet {
        use super::*;

        #[test]
        fn collects_nothing_into_a_null_list() {
            parse_cocos(std::ptr::null_mut());
        }

        #[test]
        fn collects_a_typed_diagnostic() {
            let list = unsafe { flight_create_import_diagnostic_list() };
            parse_cocos(list);
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
                unsafe { flight_get_import_diagnostic_list_detail_length(list, 0) },
                1
            );
            assert_eq!(
                unsafe { flight_get_import_diagnostic_list_detail_kind(list, 0, 0) },
                2
            );
            unsafe { flight_destroy_import_diagnostic_list(list) };
        }
    }
}
