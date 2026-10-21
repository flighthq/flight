use std::collections::HashMap;

use flight_importdiagnostics::*;

mod format_import_diagnostic {
    use super::*;

    #[test]
    fn omits_the_detail_section_when_there_is_no_detail() {
        let line = format_import_diagnostic(&ImportDiagnostic {
            detail: None,
            kind: "md2.bad-magic".to_string(),
            origin: "parseMd2".to_string(),
            severity: ImportDiagnosticSeverity::Reject,
        });
        assert_eq!(line, "Reject parseMd2: md2.bad-magic");
    }

    #[test]
    fn renders_boolean_number_and_string_detail_values() {
        let line = format_import_diagnostic(&ImportDiagnostic {
            detail: Some(HashMap::from([
                (
                    "name".to_string(),
                    ImportDiagnosticDetailValue::String("mesh".to_string()),
                ),
                (
                    "count".to_string(),
                    ImportDiagnosticDetailValue::Number(3.5),
                ),
                ("valid".to_string(), ImportDiagnosticDetailValue::Bool(true)),
            ])),
            kind: "gltf.detail-values".to_string(),
            origin: "readAccessor".to_string(),
            severity: ImportDiagnosticSeverity::Recover,
        });
        assert_eq!(
            line,
            "Recover readAccessor: gltf.detail-values count=3.5 name=mesh valid=true"
        );
    }

    #[test]
    fn renders_severity_origin_and_kind_with_detail_keys_sorted() {
        let line = format_import_diagnostic(&ImportDiagnostic {
            detail: Some(HashMap::from([
                (
                    "expected".to_string(),
                    ImportDiagnosticDetailValue::Number(4.0),
                ),
                (
                    "actual".to_string(),
                    ImportDiagnosticDetailValue::Number(3.0),
                ),
            ])),
            kind: "awd2.skin-vertex-mismatch".to_string(),
            origin: "buildAwdSkin".to_string(),
            severity: ImportDiagnosticSeverity::Drop,
        });
        assert_eq!(
            line,
            "Drop buildAwdSkin: awd2.skin-vertex-mismatch actual=3 expected=4"
        );
    }

    #[test]
    fn sorts_detail_keys_by_utf16_code_units_like_javascript() {
        let line = format_import_diagnostic(&ImportDiagnostic {
            detail: Some(HashMap::from([
                (
                    "\u{E000}".to_string(),
                    ImportDiagnosticDetailValue::String("bmp".to_string()),
                ),
                (
                    "\u{1F600}".to_string(),
                    ImportDiagnosticDetailValue::String("astral".to_string()),
                ),
            ])),
            kind: "gltf.key-order".to_string(),
            origin: "readAccessor".to_string(),
            severity: ImportDiagnosticSeverity::Skip,
        });
        assert_eq!(
            line,
            "Skip readAccessor: gltf.key-order \u{1F600}=astral \u{E000}=bmp"
        );
    }
}
