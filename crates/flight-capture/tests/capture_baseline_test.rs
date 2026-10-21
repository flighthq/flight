use flight_capture::contract::*;
use flight_entity::set_record_value;

fn provenance() -> CaptureBaselineProvenance {
    return CaptureBaselineProvenance {
        computation_id: Some("grid-average-rgb-v1".to_string()),
        frames: 1,
        source_hash: Some("a1b2c3".to_string()),
        target_kind: Some("webgl".to_string()),
        verify_published: true,
        warmup_frames: 0,
    };
}

fn empty_column() -> CaptureColumnBaseline {
    return CaptureColumnBaseline {
        fingerprint: None,
        source_hash: None,
        sha256: None,
        fingerprint_provenance: None,
        sha256_provenance: None,
    };
}

mod create_capture_baseline {
    use super::*;

    #[test]
    fn allocates_an_empty_record() {
        let baseline = create_capture_baseline();
        assert_eq!(format_capture_baseline(&baseline), "{}\n");
        assert_eq!(
            get_capture_baseline_field(&baseline, "canvas", CaptureBaselineField::Fingerprint),
            None
        );
    }

    #[test]
    fn allocates_a_distinct_record_each_call() {
        let mut first = create_capture_baseline();
        let second = create_capture_baseline();
        set_capture_baseline_field(
            &mut first,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:000000",
        );
        assert_eq!(
            get_capture_baseline_field(&second, "canvas", CaptureBaselineField::Fingerprint),
            None
        );
    }
}

mod format_capture_baseline {
    use super::*;

    #[test]
    fn sorts_columns_orders_fields_indents_by_two_spaces_and_ends_with_a_newline() {
        let mut baseline = create_capture_baseline();
        let mut webgl = empty_column();
        webgl.fingerprint = Some("1:ffffff".to_string());
        webgl.source_hash = Some("legacy-source".to_string());
        webgl.sha256 = Some("aaa".to_string());
        set_record_value(&mut baseline, "flight:webgl".to_string(), webgl);
        let mut canvas = empty_column();
        canvas.fingerprint = Some("1:000000".to_string());
        set_record_value(&mut baseline, "canvas".to_string(), canvas);
        assert_eq!(
            format_capture_baseline(&baseline),
            "{\n  \"canvas\": {\n    \"fingerprint\": \"1:000000\"\n  },\n  \"flight:webgl\": {\n    \"fingerprint\": \"1:ffffff\",\n    \"sourceHash\": \"legacy-source\",\n    \"sha256\": \"aaa\"\n  }\n}\n"
        );
    }

    #[test]
    fn omits_absent_fields() {
        let mut baseline = create_capture_baseline();
        let mut canvas = empty_column();
        canvas.sha256 = Some("hash".to_string());
        set_record_value(&mut baseline, "canvas".to_string(), canvas);
        assert_eq!(
            format_capture_baseline(&baseline),
            "{\n  \"canvas\": {\n    \"sha256\": \"hash\"\n  }\n}\n"
        );
    }

    #[test]
    fn serializes_the_empty_baseline_as_an_empty_object_with_a_trailing_newline() {
        assert_eq!(format_capture_baseline(&create_capture_baseline()), "{}\n");
    }

    #[test]
    fn emits_provenance_last_with_camel_case_members() {
        let mut baseline = create_capture_baseline();
        let mut canvas = empty_column();
        canvas.fingerprint = Some("1:000000".to_string());
        canvas.sha256 = Some("abc".to_string());
        canvas.fingerprint_provenance = Some(provenance());
        let mut sha256_provenance = provenance();
        sha256_provenance.frames = 2;
        canvas.sha256_provenance = Some(sha256_provenance);
        set_record_value(&mut baseline, "canvas".to_string(), canvas);
        assert_eq!(
            format_capture_baseline(&baseline),
            "{\n  \"canvas\": {\n    \"fingerprint\": \"1:000000\",\n    \"sha256\": \"abc\",\n    \"fingerprintProvenance\": {\n      \"computationId\": \"grid-average-rgb-v1\",\n      \"frames\": 1,\n      \"sourceHash\": \"a1b2c3\",\n      \"targetKind\": \"webgl\",\n      \"verifyPublished\": true,\n      \"warmupFrames\": 0\n    },\n    \"sha256Provenance\": {\n      \"computationId\": \"grid-average-rgb-v1\",\n      \"frames\": 2,\n      \"sourceHash\": \"a1b2c3\",\n      \"targetKind\": \"webgl\",\n      \"verifyPublished\": true,\n      \"warmupFrames\": 0\n    }\n  }\n}\n"
        );
    }
}

mod get_capture_baseline_field {
    use super::*;

    #[test]
    fn returns_none_for_absent_columns_and_fields() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:000000",
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "canvas", CaptureBaselineField::Sha256),
            None
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "webgl", CaptureBaselineField::Fingerprint),
            None
        );
    }

    #[test]
    fn reads_a_set_field_across_independent_columns() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:000000",
        );
        set_capture_baseline_field(
            &mut baseline,
            "webgl",
            CaptureBaselineField::Fingerprint,
            "1:ffffff",
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "canvas", CaptureBaselineField::Fingerprint),
            Some("1:000000".to_string())
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "webgl", CaptureBaselineField::Fingerprint),
            Some("1:ffffff".to_string())
        );
    }
}

mod get_capture_baseline_provenance {
    use super::*;

    #[test]
    fn reads_back_what_was_recorded() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_provenance(
            &mut baseline,
            "webgl",
            CaptureBaselineProvenanceField::Sha256,
            &provenance(),
        );
        assert_eq!(
            get_capture_baseline_provenance(
                &baseline,
                "webgl",
                CaptureBaselineProvenanceField::Sha256
            ),
            Some(provenance())
        );
    }

    #[test]
    fn does_not_answer_for_the_other_value() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_provenance(
            &mut baseline,
            "webgl",
            CaptureBaselineProvenanceField::Sha256,
            &provenance(),
        );
        // fingerprint is written by a DIFFERENT pass. A sha256 stamp must not read as covering it.
        assert_eq!(
            get_capture_baseline_provenance(
                &baseline,
                "webgl",
                CaptureBaselineProvenanceField::Fingerprint
            ),
            None
        );
        assert_eq!(
            get_capture_baseline_provenance(
                &baseline,
                "webgl",
                CaptureBaselineProvenanceField::Sha256
            ),
            Some(provenance())
        );
    }

    #[test]
    fn reads_a_column_written_before_provenance_existed_as_unknown() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(&mut baseline, "webgl", CaptureBaselineField::Sha256, "abc");
        assert_eq!(
            get_capture_baseline_provenance(
                &baseline,
                "webgl",
                CaptureBaselineProvenanceField::Sha256
            ),
            None
        );
        assert_eq!(
            get_capture_baseline_provenance(
                &baseline,
                "absent",
                CaptureBaselineProvenanceField::Sha256
            ),
            None
        );
    }
}

mod parse_capture_baseline {
    use super::*;

    #[test]
    fn round_trips_format_output_to_a_stable_equal_record() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(
            &mut baseline,
            "flight:webgl",
            CaptureBaselineField::Fingerprint,
            "1:ffffff",
        );
        set_capture_baseline_field(
            &mut baseline,
            "flight:webgl",
            CaptureBaselineField::Sha256,
            "aaa",
        );
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:000000",
        );
        let text = format_capture_baseline(&baseline);
        let parsed = parse_capture_baseline(&text).expect("baseline parses");
        assert_eq!(
            get_capture_baseline_field(&parsed, "flight:webgl", CaptureBaselineField::Fingerprint),
            Some("1:ffffff".to_string())
        );
        assert_eq!(
            get_capture_baseline_field(&parsed, "flight:webgl", CaptureBaselineField::Sha256),
            Some("aaa".to_string())
        );
        assert_eq!(
            get_capture_baseline_field(&parsed, "canvas", CaptureBaselineField::Fingerprint),
            Some("1:000000".to_string())
        );
        assert_eq!(format_capture_baseline(&parsed), text);
    }

    #[test]
    fn returns_none_for_malformed_json() {
        assert!(parse_capture_baseline("{not json").is_none());
    }

    #[test]
    fn returns_none_for_a_non_object_top_level_value() {
        assert!(parse_capture_baseline("42").is_none());
        assert!(parse_capture_baseline("[]").is_none());
        assert!(parse_capture_baseline("null").is_none());
    }

    #[test]
    fn drops_unknown_column_keys_the_source_drops_when_formatting() {
        let parsed =
            parse_capture_baseline("{\"canvas\":{\"fingerprint\":\"1:000000\",\"extra\":\"x\"}}")
                .expect("baseline parses");
        assert_eq!(
            format_capture_baseline(&parsed),
            "{\n  \"canvas\": {\n    \"fingerprint\": \"1:000000\"\n  }\n}\n"
        );
    }

    #[test]
    fn returns_none_for_a_known_field_with_the_wrong_json_type() {
        assert!(parse_capture_baseline("{\"canvas\":{\"fingerprint\":7}}").is_none());
    }
}

mod set_capture_baseline_field {
    use super::*;

    #[test]
    fn creates_the_column_entry_on_first_write_and_merges_later_fields() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:000000",
        );
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Sha256,
            "hash",
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "canvas", CaptureBaselineField::Fingerprint),
            Some("1:000000".to_string())
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "canvas", CaptureBaselineField::Sha256),
            Some("hash".to_string())
        );
    }

    #[test]
    fn overwrites_an_existing_field_in_place() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:000000",
        );
        set_capture_baseline_field(
            &mut baseline,
            "canvas",
            CaptureBaselineField::Fingerprint,
            "1:ffffff",
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "canvas", CaptureBaselineField::Fingerprint),
            Some("1:ffffff".to_string())
        );
    }
}

mod set_capture_baseline_provenance {
    use super::*;

    #[test]
    fn creates_the_column_and_leaves_the_other_fields_alone() {
        let mut baseline = create_capture_baseline();
        set_capture_baseline_field(&mut baseline, "webgl", CaptureBaselineField::Sha256, "abc");
        set_capture_baseline_provenance(
            &mut baseline,
            "webgl",
            CaptureBaselineProvenanceField::Sha256,
            &provenance(),
        );
        assert_eq!(
            get_capture_baseline_field(&baseline, "webgl", CaptureBaselineField::Sha256),
            Some("abc".to_string())
        );
        assert_eq!(
            get_capture_baseline_provenance(
                &baseline,
                "webgl",
                CaptureBaselineProvenanceField::Sha256
            ),
            Some(provenance())
        );
    }

    #[test]
    fn copies_rather_than_aliasing_so_a_later_caller_mutation_cannot_rewrite_the_record() {
        let mut baseline = create_capture_baseline();
        let mut source = provenance();
        set_capture_baseline_provenance(
            &mut baseline,
            "webgl",
            CaptureBaselineProvenanceField::Sha256,
            &source,
        );
        source.frames = 99;
        let stored = get_capture_baseline_provenance(
            &baseline,
            "webgl",
            CaptureBaselineProvenanceField::Sha256,
        )
        .expect("provenance is recorded");
        assert_eq!(stored.frames, 1);
    }
}
