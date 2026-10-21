use flight_importdiagnostics::contract::*;

mod get_import_diagnostic_severity_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_string() {
        assert_eq!(
            get_import_diagnostic_severity_string(ImportDiagnosticSeverity::Drop),
            "Drop"
        );
        assert_eq!(
            get_import_diagnostic_severity_string(ImportDiagnosticSeverity::Recover),
            "Recover"
        );
        assert_eq!(
            get_import_diagnostic_severity_string(ImportDiagnosticSeverity::Reject),
            "Reject"
        );
        assert_eq!(
            get_import_diagnostic_severity_string(ImportDiagnosticSeverity::Skip),
            "Skip"
        );
    }
}

mod parse_import_diagnostic_severity {
    use super::*;

    #[test]
    fn parses_exact_ts_strings_and_rejects_other_spelling() {
        assert_eq!(
            parse_import_diagnostic_severity("Drop"),
            Some(ImportDiagnosticSeverity::Drop)
        );
        assert_eq!(
            parse_import_diagnostic_severity("Recover"),
            Some(ImportDiagnosticSeverity::Recover)
        );
        assert_eq!(
            parse_import_diagnostic_severity("Reject"),
            Some(ImportDiagnosticSeverity::Reject)
        );
        assert_eq!(
            parse_import_diagnostic_severity("Skip"),
            Some(ImportDiagnosticSeverity::Skip)
        );
        assert_eq!(parse_import_diagnostic_severity("drop"), None);
    }
}
