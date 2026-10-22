use flight_entity::{Record, set_record_value};
use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

fn region_atlas(count: i32) -> flight_entity::Ref<flight_textureatlas::TextureAtlas> {
    let shared = atlas();
    for i in 0..count {
        push_region(&shared, i, Some(&format!("frame_{i}")), i as f32 * 32.0);
    }
    return shared;
}

fn animations(entries: &[(&str, &[f64])]) -> Record<flight_entity::Ref<SpritesheetAnimation>> {
    let make: fn() -> Record<flight_entity::Ref<SpritesheetAnimation>> = Record::default;
    let mut record = make();
    for (name, frames) in entries {
        let animation = create_spritesheet_animation();
        animation.write().unwrap().frames = frames.to_vec();
        set_record_value(&mut record, name.to_string(), animation);
    }
    return record;
}

fn sheet_with(
    atlas_regions: Option<i32>,
    frame_ids: &[i32],
    anims: &[(&str, &[f64])],
) -> Spritesheet {
    let mut sheet = create_spritesheet();
    sheet.atlas = atlas_regions.map(region_atlas);
    sheet.frames = frame_ids.iter().map(|id| frame(*id)).collect();
    sheet.animations = animations(anims);
    return sheet;
}

fn checked(
    atlas_regions: Option<i32>,
    frame_ids: &[i32],
    anims: &[(&str, &[f64])],
) -> (bool, Vec<SpritesheetValidationDiagnostic>) {
    let mut out = Vec::new();
    let found = validate_spritesheet(&mut out, &sheet_with(atlas_regions, frame_ids, anims));
    return (found, out);
}

fn stale_diagnostic() -> SpritesheetValidationDiagnostic {
    return SpritesheetValidationDiagnostic {
        animation_name: Some("stale".to_string()),
        frame_index: Some(42),
        message: "stale".to_string(),
        severity: SpritesheetValidationSeverity::Warning,
    };
}

mod get_spritesheet_parse_diagnostic_severity_string {
    use super::*;

    #[test]
    fn round_trips_both_severities() {
        for (value, text) in [
            (SpritesheetParseDiagnosticSeverity::Error, "error"),
            (SpritesheetParseDiagnosticSeverity::Warning, "warning"),
        ] {
            assert_eq!(
                get_spritesheet_parse_diagnostic_severity_string(value),
                text
            );
            assert_eq!(
                parse_spritesheet_parse_diagnostic_severity(text),
                Some(value)
            );
        }
    }
}

mod get_spritesheet_validation_severity_string {
    use super::*;

    #[test]
    fn round_trips_both_severities() {
        for (value, text) in [
            (SpritesheetValidationSeverity::Error, "error"),
            (SpritesheetValidationSeverity::Warning, "warning"),
        ] {
            assert_eq!(get_spritesheet_validation_severity_string(value), text);
            assert_eq!(parse_spritesheet_validation_severity(text), Some(value));
        }
    }
}

mod parse_spritesheet_parse_diagnostic_severity {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_spritesheet_parse_diagnostic_severity("Error"), None);
    }
}

mod parse_spritesheet_validation_severity {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_spritesheet_validation_severity("info"), None);
    }
}

mod validate_spritesheet {
    use super::*;

    #[test]
    fn returns_null_for_a_valid_spritesheet_or_without_an_atlas() {
        assert_eq!(
            checked(Some(3), &[0, 1, 2], &[("run", &[0.0, 1.0, 2.0])]),
            (false, vec![])
        );
        assert_eq!(checked(None, &[99], &[("idle", &[0.0])]), (false, vec![]));
    }

    #[test]
    fn reports_an_error_for_a_frame_referencing_a_missing_atlas_region() {
        let (found, diagnostics) = checked(Some(2), &[0, 5], &[]);
        assert!(found);
        assert_eq!(
            diagnostics,
            vec![SpritesheetValidationDiagnostic {
                animation_name: None,
                frame_index: Some(1),
                message: "Frame 1 references atlas region id 5 which does not exist in the atlas."
                    .to_string(),
                severity: SpritesheetValidationSeverity::Error,
            }]
        );
    }

    #[test]
    fn reports_an_error_for_an_out_of_range_frame_reference() {
        let (found, diagnostics) = checked(Some(2), &[0, 1], &[("run", &[0.0, 1.0, 5.0])]);
        assert!(found);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            (
                diagnostics[0].animation_name.as_deref(),
                diagnostics[0].frame_index
            ),
            (Some("run"), Some(2))
        );
        assert_eq!(
            diagnostics[0].message,
            "Animation \"run\" references frame index 5 which is out of range (sheet has 2 frames)."
        );
        assert_eq!(
            diagnostics[0].severity,
            SpritesheetValidationSeverity::Error
        );
    }

    #[test]
    fn reports_a_warning_for_an_animation_with_zero_frames() {
        let (found, diagnostics) = checked(Some(1), &[0], &[("empty", &[])]);
        assert!(found);
        assert_eq!(diagnostics[0].message, "Animation \"empty\" has no frames.");
        assert_eq!(
            (diagnostics[0].severity, diagnostics[0].frame_index),
            (SpritesheetValidationSeverity::Warning, None)
        );
    }

    #[test]
    fn accumulates_frames_before_animations_in_property_order() {
        let (found, diagnostics) = checked(
            Some(1),
            &[0, 99],
            &[("bad", &[0.0, 7.0]), ("10", &[-1.0]), ("2", &[])],
        );
        assert!(found);
        let summary: Vec<(Option<&str>, Option<usize>)> = diagnostics
            .iter()
            .map(|d| (d.animation_name.as_deref(), d.frame_index))
            .collect();
        assert_eq!(
            summary,
            vec![
                (None, Some(1)),
                (Some("2"), None),
                (Some("10"), Some(0)),
                (Some("bad"), Some(1))
            ]
        );
    }

    #[test]
    fn formats_frame_references_as_js_numbers_and_ignores_nan() {
        let (found, diagnostics) = checked(None, &[0], &[("x", &[1.5, -2.0, f64::NAN])]);
        assert!(found);
        let messages: Vec<&str> = diagnostics.iter().map(|d| d.message.as_str()).collect();
        assert_eq!(
            messages,
            vec![
                "Animation \"x\" references frame index 1.5 which is out of range (sheet has 1 frames).",
                "Animation \"x\" references frame index -2 which is out of range (sheet has 1 frames).",
            ]
        );
    }
}

mod validate_spritesheet_data {
    use super::*;

    fn data(frames: &[&str], anims: Vec<SpritesheetAnimationData>) -> SpritesheetData {
        let mut data = create_spritesheet_data();
        data.frames = frames.iter().map(|name| named_frame_data(name)).collect();
        data.animations = anims;
        return data;
    }

    fn checked_data(source: &SpritesheetData) -> (bool, Vec<SpritesheetValidationDiagnostic>) {
        let mut out = Vec::new();
        let found = validate_spritesheet_data(&mut out, source);
        return (found, out);
    }

    #[test]
    fn returns_null_for_valid_data_or_no_animations() {
        assert_eq!(
            checked_data(&data(
                &["walk_0", "walk_1"],
                vec![named_animation_data("walk", &["walk_0", "walk_1"])]
            )),
            (false, vec![])
        );
        assert_eq!(checked_data(&data(&["a"], vec![])), (false, vec![]));
    }

    #[test]
    fn reports_an_error_for_an_animation_referencing_a_missing_frame_name() {
        let (found, diagnostics) = checked_data(&data(
            &["walk_0"],
            vec![named_animation_data("walk", &["walk_0", "walk_99"])],
        ));
        assert!(found);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            (diagnostics[0].frame_index, diagnostics[0].severity),
            (Some(1), SpritesheetValidationSeverity::Error)
        );
        assert_eq!(
            diagnostics[0].message,
            "Animation \"walk\" references frame name \"walk_99\" which is not present in the data frame list."
        );
    }

    #[test]
    fn reports_a_warning_for_an_animation_with_empty_frame_names_and_skips_its_duration_check() {
        let mut empty = named_animation_data("run", &[]);
        empty.frame_durations = Some(vec![100.0]);
        let (found, diagnostics) = checked_data(&data(&["a"], vec![empty]));
        assert!(found);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].message,
            "Animation \"run\" has no frameNames — all sheet frames will be used as the frame list."
        );
        assert_eq!(
            diagnostics[0].severity,
            SpritesheetValidationSeverity::Warning
        );
    }

    #[test]
    fn reports_a_warning_when_frame_durations_length_differs_after_name_errors() {
        let mut run = named_animation_data("run", &["a", "zz"]);
        run.frame_durations = Some(vec![100.0]);
        let (found, diagnostics) = checked_data(&data(&["a", "b"], vec![run]));
        assert!(found);
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(
            diagnostics[0].severity,
            SpritesheetValidationSeverity::Error
        );
        assert_eq!(
            (diagnostics[1].frame_index, diagnostics[1].severity),
            (None, SpritesheetValidationSeverity::Warning)
        );
        assert_eq!(
            diagnostics[1].message,
            "Animation \"run\" has 1 frameDurations but 2 frameNames — lengths should match."
        );
    }

    #[test]
    fn accumulates_diagnostics_across_animations_and_ignores_empty_frame_names() {
        let (found, diagnostics) = checked_data(&data(
            &["a", ""],
            vec![
                named_animation_data("anim1", &[]),
                named_animation_data("anim2", &["missing", ""]),
            ],
        ));
        assert!(found);
        assert_eq!(diagnostics.len(), 3);
    }

    #[test]
    fn clears_a_prefilled_out_and_returns_false_for_valid_data() {
        let mut out = vec![stale_diagnostic()];
        let source = data(&["walk_0"], vec![named_animation_data("walk", &["walk_0"])]);
        assert!(!validate_spritesheet_data(&mut out, &source));
        assert!(out.is_empty());
    }

    #[test]
    fn replaces_stale_contents_in_source_order_without_appending_on_repeat() {
        let mut run = named_animation_data("run", &["a", "zz"]);
        run.frame_durations = Some(vec![100.0]);
        let source = data(&["a"], vec![named_animation_data("idle", &[]), run]);
        let mut out = vec![stale_diagnostic()];
        assert!(validate_spritesheet_data(&mut out, &source));
        let summary: Vec<(Option<&str>, Option<usize>, SpritesheetValidationSeverity)> = out
            .iter()
            .map(|d| (d.animation_name.as_deref(), d.frame_index, d.severity))
            .collect();
        let expected = vec![
            (Some("idle"), None, SpritesheetValidationSeverity::Warning),
            (Some("run"), Some(1), SpritesheetValidationSeverity::Error),
            (Some("run"), None, SpritesheetValidationSeverity::Warning),
        ];
        assert_eq!(summary, expected);
        let first = out.clone();
        assert!(validate_spritesheet_data(&mut out, &source));
        assert_eq!(out, first);
    }

    #[test]
    fn refills_the_same_storage_retaining_its_capacity() {
        let source = data(&["a"], vec![named_animation_data("walk", &["zz"])]);
        let mut out: Vec<SpritesheetValidationDiagnostic> = Vec::with_capacity(8);
        let (pointer, capacity) = (out.as_ptr(), out.capacity());
        assert!(validate_spritesheet_data(&mut out, &source));
        assert_eq!(out.len(), 1);
        assert_eq!((out.as_ptr(), out.capacity()), (pointer, capacity));
        assert!(!validate_spritesheet_data(&mut out, &data(&["a"], vec![])));
        assert_eq!(
            (out.as_ptr(), out.capacity(), out.len()),
            (pointer, capacity, 0)
        );
    }
}

mod validate_spritesheet_out {
    use super::*;

    #[test]
    fn clears_a_prefilled_out_and_returns_false_for_a_valid_spritesheet() {
        let mut out = vec![stale_diagnostic(), stale_diagnostic()];
        let sheet = sheet_with(Some(3), &[0, 1, 2], &[("run", &[0.0, 1.0, 2.0])]);
        assert!(!validate_spritesheet(&mut out, &sheet));
        assert!(out.is_empty());
    }

    #[test]
    fn replaces_stale_contents_with_this_call_in_source_order() {
        let mut out = vec![stale_diagnostic()];
        let sheet = sheet_with(Some(1), &[0, 99], &[("bad", &[0.0, 7.0]), ("2", &[])]);
        assert!(validate_spritesheet(&mut out, &sheet));
        let summary: Vec<(Option<&str>, Option<usize>)> = out
            .iter()
            .map(|d| (d.animation_name.as_deref(), d.frame_index))
            .collect();
        assert_eq!(
            summary,
            vec![(None, Some(1)), (Some("2"), None), (Some("bad"), Some(1))]
        );
    }

    #[test]
    fn repeated_validation_of_an_invalid_sheet_does_not_append() {
        let sheet = sheet_with(Some(2), &[0, 5], &[("run", &[9.0])]);
        let mut out = Vec::new();
        assert!(validate_spritesheet(&mut out, &sheet));
        let first = out.clone();
        assert!(validate_spritesheet(&mut out, &sheet));
        assert_eq!(out, first);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn refills_the_same_storage_retaining_its_capacity() {
        let sheet = sheet_with(Some(2), &[0, 5], &[("run", &[9.0])]);
        let mut out: Vec<SpritesheetValidationDiagnostic> = Vec::with_capacity(8);
        let (pointer, capacity) = (out.as_ptr(), out.capacity());
        assert!(validate_spritesheet(&mut out, &sheet));
        assert_eq!(out.len(), 2);
        assert_eq!((out.as_ptr(), out.capacity()), (pointer, capacity));
        assert!(!validate_spritesheet(
            &mut out,
            &sheet_with(None, &[0], &[])
        ));
        assert_eq!(
            (out.as_ptr(), out.capacity(), out.len()),
            (pointer, capacity, 0)
        );
    }
}
