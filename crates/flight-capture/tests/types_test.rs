use flight_capture::contract::*;

mod get_capture_baseline_field_string {
    use super::*;

    #[test]
    fn maps_each_closed_field_to_its_source_name() {
        assert_eq!(
            get_capture_baseline_field_string(CaptureBaselineField::Fingerprint),
            "fingerprint"
        );
        assert_eq!(
            get_capture_baseline_field_string(CaptureBaselineField::Sha256),
            "sha256"
        );
    }
}

mod get_capture_baseline_provenance_field_string {
    use super::*;

    #[test]
    fn maps_each_closed_field_to_its_source_name() {
        assert_eq!(
            get_capture_baseline_provenance_field_string(
                CaptureBaselineProvenanceField::Fingerprint
            ),
            "fingerprint"
        );
        assert_eq!(
            get_capture_baseline_provenance_field_string(CaptureBaselineProvenanceField::Sha256),
            "sha256"
        );
    }
}

mod parse_capture_baseline_field {
    use super::*;

    #[test]
    fn parses_the_source_names_and_rejects_anything_else() {
        assert_eq!(
            parse_capture_baseline_field("fingerprint"),
            Some(CaptureBaselineField::Fingerprint)
        );
        assert_eq!(
            parse_capture_baseline_field("sha256"),
            Some(CaptureBaselineField::Sha256)
        );
        assert_eq!(parse_capture_baseline_field("sourceHash"), None);
        assert_eq!(parse_capture_baseline_field(""), None);
    }
}

mod parse_capture_baseline_provenance_field {
    use super::*;

    #[test]
    fn parses_the_source_names_and_rejects_anything_else() {
        assert_eq!(
            parse_capture_baseline_provenance_field("fingerprint"),
            Some(CaptureBaselineProvenanceField::Fingerprint)
        );
        assert_eq!(
            parse_capture_baseline_provenance_field("sha256"),
            Some(CaptureBaselineProvenanceField::Sha256)
        );
        assert_eq!(parse_capture_baseline_provenance_field("sourceHash"), None);
        assert_eq!(parse_capture_baseline_provenance_field(""), None);
    }
}
