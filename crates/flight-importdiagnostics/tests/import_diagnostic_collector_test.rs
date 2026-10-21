use std::collections::HashMap;

use flight_importdiagnostics::*;

mod collect_import_diagnostics {
    use super::*;

    #[test]
    fn clears_a_reused_out_before_the_run_and_keeps_its_capacity() {
        let mut diagnostics = Vec::with_capacity(8);
        collect_import_diagnostics(&mut diagnostics, &|sink| {
            report_import_diagnostic(
                Some(&mut *sink),
                ImportDiagnosticSeverity::Skip,
                "stale",
                "first",
                None,
            );
        });

        collect_import_diagnostics(&mut diagnostics, &|sink| {
            assert!(sink.is_empty());
            report_import_diagnostic(
                Some(&mut *sink),
                ImportDiagnosticSeverity::Skip,
                "fresh",
                "second",
                None,
            );
        });

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "fresh");
        assert!(diagnostics.capacity() >= 8);
    }

    #[test]
    fn returns_an_empty_array_when_the_parse_emits_nothing_well_formed_input() {
        let mut diagnostics = Vec::new();
        collect_import_diagnostics(&mut diagnostics, &|_sink| {});
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn returns_the_crumbs_the_run_callback_emits_into_its_engaged_collector() {
        let mut diagnostics = Vec::new();
        collect_import_diagnostics(&mut diagnostics, &|sink| {
            report_import_diagnostic(
                Some(&mut *sink),
                ImportDiagnosticSeverity::Skip,
                "awd2.method-material",
                "resolveAwdMaterial",
                Some(HashMap::from([(
                    "count".to_string(),
                    ImportDiagnosticDetailValue::Number(2.0),
                )])),
            );
            report_import_diagnostic(
                Some(&mut *sink),
                ImportDiagnosticSeverity::Reject,
                "awd2.unsupported-version",
                "parseAwd2",
                Some(HashMap::from([(
                    "version".to_string(),
                    ImportDiagnosticDetailValue::Number(3.0),
                )])),
            );
        });
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].kind, "awd2.method-material");
        assert_eq!(diagnostics[1].kind, "awd2.unsupported-version");
    }
}

mod report_import_diagnostic {
    use super::*;

    #[test]
    fn carries_the_detail_through_none_when_none_is_supplied() {
        let mut sink: Vec<ImportDiagnostic> = Vec::new();
        report_import_diagnostic(
            Some(&mut sink),
            ImportDiagnosticSeverity::Reject,
            "md2.bad-magic",
            "parseMd2",
            None,
        );
        assert_eq!(sink[0].detail, None);
        assert_eq!(sink[0].severity, ImportDiagnosticSeverity::Reject);
    }

    #[test]
    fn does_nothing_without_throwing_or_allocating_when_the_collector_is_none() {
        report_import_diagnostic(
            None,
            ImportDiagnosticSeverity::Drop,
            "gltf.accessor-out-of-bounds",
            "readAccessor",
            None,
        );
    }

    #[test]
    fn pushes_a_structured_crumb_onto_the_collector_when_one_is_engaged() {
        let mut sink: Vec<ImportDiagnostic> = Vec::new();
        report_import_diagnostic(
            Some(&mut sink),
            ImportDiagnosticSeverity::Drop,
            "awd2.skin-vertex-mismatch",
            "buildAwdSkin",
            Some(HashMap::from([
                (
                    "actual".to_string(),
                    ImportDiagnosticDetailValue::Number(3.0),
                ),
                (
                    "expected".to_string(),
                    ImportDiagnosticDetailValue::Number(4.0),
                ),
            ])),
        );
        assert_eq!(sink.len(), 1);
        assert_eq!(sink[0].kind, "awd2.skin-vertex-mismatch");
        assert_eq!(sink[0].origin, "buildAwdSkin");
        assert_eq!(sink[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            sink[0].detail.as_ref().unwrap().get("actual"),
            Some(&ImportDiagnosticDetailValue::Number(3.0))
        );
        assert_eq!(
            sink[0].detail.as_ref().unwrap().get("expected"),
            Some(&ImportDiagnosticDetailValue::Number(4.0))
        );
    }
}
