use flight_entity::Ref;
use flight_textshaper::contract::*;

use crate::text_shaper_fixture::*;

/// The source's `_makeRun`: glyph id = cluster, advance width = sum of advances.
fn make_run(glyphs: &[(i32, f32, f32)]) -> Ref<ShapedRun> {
    let total: f32 = glyphs.iter().map(|(_, advance, _)| advance).sum();
    return run(
        total,
        glyphs
            .iter()
            .map(|(cluster, advance, offset)| glyph(*cluster, *cluster, *advance, *offset))
            .collect(),
        "Latn",
    );
}

mod get_caret_positions_for_run {
    use super::*;

    #[test]
    fn returns_zero_for_an_empty_run() {
        assert_eq!(
            get_caret_positions_for_run(&make_run(&[]).read().unwrap()),
            vec![0.0]
        );
    }

    #[test]
    fn returns_glyph_count_plus_one_positions_starting_at_0() {
        let run = make_run(&[(0, 8.0, 0.0), (1, 7.0, 0.0), (2, 9.0, 0.0)]);
        assert_eq!(
            get_caret_positions_for_run(&run.read().unwrap()),
            vec![0.0, 8.0, 15.0, 24.0]
        );
    }

    #[test]
    fn last_position_equals_the_run_advance_width() {
        let run = make_run(&[(0, 5.0, 0.0), (1, 3.0, 0.0)]);
        let run = run.read().unwrap();
        assert_eq!(
            *get_caret_positions_for_run(&run).last().unwrap(),
            run.advance_width
        );
    }

    #[test]
    fn uses_pen_advances_rather_than_glyph_drawing_offsets() {
        let run = make_run(&[(0, 8.0, 3.0), (1, 7.0, -2.0)]);
        assert_eq!(
            get_caret_positions_for_run(&run.read().unwrap()),
            vec![0.0, 8.0, 15.0]
        );
    }

    #[test]
    fn reads_only_the_valid_glyph_count_of_an_over_allocated_buffer() {
        let run = make_run(&[(0, 8.0, 0.0), (1, 7.0, 0.0)]);
        run.write().unwrap().glyph_count = 1;
        assert_eq!(
            get_caret_positions_for_run(&run.read().unwrap()),
            vec![0.0, 8.0]
        );
    }
}

mod get_cluster_for_index {
    use super::*;

    #[test]
    fn returns_minus_one_for_an_empty_run_or_a_negative_index() {
        assert_eq!(get_cluster_for_index(&make_run(&[]).read().unwrap(), 0), -1);
        assert_eq!(
            get_cluster_for_index(&make_run(&[(0, 8.0, 0.0)]).read().unwrap(), -1),
            -1
        );
    }

    #[test]
    fn returns_the_cluster_of_the_glyph_covering_the_string_index() {
        let run = make_run(&[(0, 8.0, 0.0), (2, 7.0, 0.0), (4, 9.0, 0.0)]);
        let run = run.read().unwrap();
        for (index, cluster) in [(0, 0), (1, 0), (2, 2), (3, 2), (4, 4), (10, 4)] {
            assert_eq!(get_cluster_for_index(&run, index), cluster);
        }
    }

    #[test]
    fn takes_the_last_qualifying_glyph_in_buffer_order_for_rtl_runs() {
        let run = make_run(&[(4, 9.0, 0.0), (2, 7.0, 0.0), (0, 8.0, 0.0)]);
        assert_eq!(get_cluster_for_index(&run.read().unwrap(), 3), 0);
    }

    #[test]
    fn returns_minus_one_when_every_cluster_is_after_the_index() {
        let run = make_run(&[(3, 9.0, 0.0)]);
        assert_eq!(get_cluster_for_index(&run.read().unwrap(), 1), -1);
    }
}

mod get_index_range_for_cluster {
    use super::*;

    #[test]
    fn returns_null_for_an_empty_run_or_an_absent_cluster() {
        assert_eq!(
            get_index_range_for_cluster(&make_run(&[]).read().unwrap(), 0, None),
            None
        );
        assert_eq!(
            get_index_range_for_cluster(&make_run(&[(0, 8.0, 0.0)]).read().unwrap(), 5, None),
            None
        );
    }

    #[test]
    fn returns_cluster_to_next_cluster_for_a_non_final_cluster() {
        let run = make_run(&[(0, 8.0, 0.0), (2, 7.0, 0.0), (4, 9.0, 0.0)]);
        let run = run.read().unwrap();
        assert_eq!(get_index_range_for_cluster(&run, 0, None), Some((0, 2)));
        assert_eq!(get_index_range_for_cluster(&run, 2, None), Some((2, 4)));
    }

    #[test]
    fn uses_string_length_or_cluster_plus_one_for_the_final_cluster() {
        let run = make_run(&[(0, 8.0, 0.0), (2, 7.0, 0.0)]);
        let run = run.read().unwrap();
        assert_eq!(get_index_range_for_cluster(&run, 2, Some(6)), Some((2, 6)));
        assert_eq!(get_index_range_for_cluster(&run, 2, None), Some((2, 3)));
    }

    #[test]
    fn spans_a_ligature_cluster_shared_by_several_glyphs() {
        let run = make_run(&[(0, 8.0, 0.0), (0, 0.0, 0.0), (3, 7.0, 0.0)]);
        assert_eq!(
            get_index_range_for_cluster(&run.read().unwrap(), 0, None),
            Some((0, 3))
        );
    }
}
