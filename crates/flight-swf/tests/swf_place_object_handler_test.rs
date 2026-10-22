use std::sync::{Arc, RwLock};

use crate::support::{create_matrix_record, create_test_parse_state, join_bytes, reader, uint16};
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

fn run(tag: u32, bytes: Vec<u8>, state: &mut SwfTagParseState, timeline: &mut SwfTagTimelineState) {
    assert!((SWF_PLACE_OBJECT_HANDLER.parse)(
        &mut reader(bytes),
        tag,
        state,
        timeline,
        None,
    ));
}

mod swf_place_object_handler {
    use super::*;

    #[test]
    fn claims_only_the_legacy_and_place_object_two_tags() {
        assert_eq!(SWF_PLACE_OBJECT_HANDLER.tags, vec![4, 5, 26, 28]);
        assert!(SWF_PLACE_OBJECT_HANDLER.finish_timeline.is_none());
        assert!(SWF_PLACE_OBJECT_HANDLER.instantiate.is_none());
        assert!(SWF_PLACE_OBJECT_HANDLER.resolve.is_none());
    }

    #[test]
    fn ignores_a_move_at_a_depth_with_no_existing_placement() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        run(
            26,
            join_bytes(&[&[1], &uint16(4)]),
            &mut state,
            &mut timeline,
        );
        assert!(timeline.placements.read().unwrap().is_empty());
    }

    #[test]
    fn legacy_remove_requires_the_matching_character() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        let body = join_bytes(&[
            &uint16(7),
            &uint16(4),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
        ]);
        run(4, body, &mut state, &mut timeline);
        run(
            5,
            join_bytes(&[&uint16(8), &uint16(4)]),
            &mut state,
            &mut timeline,
        );
        assert_eq!(timeline.placements.read().unwrap().len(), 1);
        run(
            5,
            join_bytes(&[&uint16(7), &uint16(4)]),
            &mut state,
            &mut timeline,
        );
        assert!(timeline.placements.read().unwrap().is_empty());
    }

    #[test]
    fn place_object_two_reads_every_non_color_field_and_move_inherits_them() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        let first = join_bytes(&[
            &[0x76],
            &uint16(4),
            &uint16(7),
            &create_matrix_record(2.0, 0.0, 0.0, 3.0, 40, 60),
            &uint16(0x8000),
            b"hero\0",
            &uint16(12),
        ]);
        run(26, first, &mut state, &mut timeline);
        run(
            26,
            join_bytes(&[&[0x01], &uint16(4)]),
            &mut state,
            &mut timeline,
        );
        let placements = timeline.placements.read().unwrap();
        assert_eq!(placements.len(), 1);
        let placement = &placements[0].1;
        assert_eq!(placement.character_id, 7);
        assert_eq!(placement.depth, 4);
        assert_eq!(placement.matrix.a, 2.0);
        assert_eq!(placement.matrix.d, 3.0);
        assert_eq!(placement.matrix.tx, 2.0);
        assert_eq!(placement.matrix.ty, 3.0);
        assert_eq!(placement.name.as_deref(), Some("hero"));
        assert_eq!(placement.clip_depth, 12);
        assert!((placement.ratio - f32::from(0x8000_u16) / 65535.0).abs() < 0.00001);
    }

    #[test]
    fn rejects_character_zero_and_truncated_records() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        run(
            26,
            join_bytes(&[&[0x02], &uint16(4), &uint16(0)]),
            &mut state,
            &mut timeline,
        );
        run(4, uint16(7).to_vec(), &mut state, &mut timeline);
        assert!(timeline.placements.read().unwrap().is_empty());
    }

    #[test]
    fn remove_object_two_deletes_by_depth_without_a_character_check() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        run(
            26,
            join_bytes(&[&[0x02], &uint16(4), &uint16(7)]),
            &mut state,
            &mut timeline,
        );
        run(28, uint16(4).to_vec(), &mut state, &mut timeline);
        assert!(timeline.placements.read().unwrap().is_empty());
    }

    #[test]
    fn replacing_an_existing_depth_preserves_its_insertion_position() {
        let mut state = create_test_parse_state();
        let mut timeline = timeline();
        for (depth, character) in [(4, 7), (2, 8), (4, 9)] {
            run(
                26,
                join_bytes(&[&[0x02], &uint16(depth), &uint16(character)]),
                &mut state,
                &mut timeline,
            );
        }
        let placements = timeline.placements.read().unwrap();
        assert_eq!(placements[0].0, 4);
        assert_eq!(placements[0].1.character_id, 9);
        assert_eq!(placements[1].0, 2);
    }
}
