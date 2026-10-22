use std::sync::{Arc, RwLock};

use crate::support::{create_test_parse_state, join_bytes, reader, uint16, uint32};
use flight_effects::ADVANCED_BLEND_MODE_OVERLAY;
use flight_importdiagnostics::ImportDiagnostic;
use flight_materials::{BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL};
use flight_swf::contract::*;

fn timeline() -> SwfTagTimelineState {
    return SwfTagTimelineState {
        actions: Vec::new(),
        cues: Vec::new(),
        frames: Vec::new(),
        labels: Vec::new(),
        placements: Arc::new(RwLock::new(Vec::new())),
        stream_chunks: Vec::new(),
        stream_format: -1,
        stream_start_frame: 1,
    };
}

fn run(bytes: Vec<u8>, state: &mut SwfTagParseState, timeline: &mut SwfTagTimelineState) {
    assert!((SWF_PLACE_OBJECT3_HANDLER.parse)(
        &mut reader(bytes),
        70,
        state,
        timeline,
        state.diagnostics.clone(),
    ));
}

mod swf_place_object3_handler {
    use super::*;

    #[test]
    fn accepts_a_direct_class_linkage_without_a_character() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        run(
            join_bytes(&[&[0x00, 0x08], &uint16(4), b"Hero\0"]),
            &mut state,
            &mut timeline,
        );
        let placements = timeline.placements.read().unwrap();
        assert_eq!(placements[0].1.character_id, 0);
        assert_eq!(placements[0].1.direct_linkage.as_deref(), Some("Hero"));
    }

    #[test]
    fn claims_place_object_three_and_four_and_only_parses() {
        assert_eq!(SWF_PLACE_OBJECT3_HANDLER.tags, vec![70, 94]);
        assert!(SWF_PLACE_OBJECT3_HANDLER.finish_timeline.is_none());
        assert!(SWF_PLACE_OBJECT3_HANDLER.instantiate.is_none());
        assert!(SWF_PLACE_OBJECT3_HANDLER.resolve.is_none());
    }

    #[test]
    fn inherits_filters_and_blend_modes_by_identity_on_a_move() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        let blur = join_bytes(&[&[1, 1], &uint32(65536), &uint32(131072), &[1]]);
        run(
            join_bytes(&[&[0x02, 0x03], &uint16(4), &uint16(7), &blur, &[13]]),
            &mut state,
            &mut timeline,
        );
        let first = timeline.placements.read().unwrap()[0].1.clone();
        run(
            join_bytes(&[&[0x01, 0x00], &uint16(4)]),
            &mut state,
            &mut timeline,
        );
        let second = timeline.placements.read().unwrap()[0].1.clone();
        assert!(Arc::ptr_eq(&first.effects, &second.effects));
        assert!(Arc::ptr_eq(
            &first.filter_adjustments,
            &second.filter_adjustments
        ));
        assert_eq!(
            second.advanced_blend_mode.as_deref(),
            Some(ADVANCED_BLEND_MODE_OVERLAY)
        );
    }

    #[test]
    fn reads_a_class_character_and_fixed_function_blend_mode() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        run(
            join_bytes(&[&[0x02, 0x0a], &uint16(4), b"Hero\0", &uint16(7), &[3]]),
            &mut state,
            &mut timeline,
        );
        let placements = timeline.placements.read().unwrap();
        let placement = &placements[0].1;
        assert_eq!(placement.character_id, 7);
        assert_eq!(placement.direct_linkage.as_deref(), Some("Hero"));
        assert_eq!(placement.blend_mode, BLEND_MODE_MULTIPLY);
        assert!(placement.advanced_blend_mode.is_none());
    }

    #[test]
    fn reports_and_drops_a_blend_mode_behind_an_unknown_filter() {
        let diagnostics = Arc::new(RwLock::new(Vec::<ImportDiagnostic>::new()));
        let mut state = create_test_parse_state();
        state.diagnostics = Some(diagnostics.clone());
        let mut timeline = timeline();
        run(
            join_bytes(&[&[0x02, 0x03], &uint16(4), &uint16(7), &[1, 255, 3]]),
            &mut state,
            &mut timeline,
        );
        let placements = timeline.placements.read().unwrap();
        assert_eq!(placements[0].1.blend_mode, BLEND_MODE_NORMAL);
        assert!(placements[0].1.effects.is_empty());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "swf.blend-mode-behind-unread-filters");
    }

    #[test]
    fn replacing_filters_with_an_empty_list_does_not_reuse_the_inherited_stack() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        run(
            join_bytes(&[&[0x02, 0x01], &uint16(4), &uint16(7), &[0]]),
            &mut state,
            &mut timeline,
        );
        let first = timeline.placements.read().unwrap()[0].1.effects.clone();
        run(
            join_bytes(&[&[0x01, 0x01], &uint16(4), &[0]]),
            &mut state,
            &mut timeline,
        );
        let second = timeline.placements.read().unwrap()[0].1.effects.clone();
        assert!(!Arc::ptr_eq(&first, &second));
    }
}
