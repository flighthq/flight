use flight_path::*;

mod create_path_morph_test {
    use super::*;

    #[test]
    fn returns_some_for_compatible_rectangles() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut end, 50.0, 50.0, 200.0, 200.0);
        let morph = create_path_morph(&start, &end);
        assert!(morph.is_some());
    }

    #[test]
    fn returns_none_for_mismatched_winding() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::EvenOdd);
        append_path_rectangle(&mut end, 0.0, 0.0, 100.0, 100.0);
        let morph = create_path_morph(&start, &end);
        assert!(morph.is_none());
    }

    #[test]
    fn returns_none_for_contour_count_mismatch() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut end, 0.0, 0.0, 100.0, 100.0);
        append_path_rectangle(&mut end, 200.0, 200.0, 50.0, 50.0);
        let morph = create_path_morph(&start, &end);
        assert!(morph.is_none());
    }
}

mod sample_path_morph_test {
    use super::*;

    #[test]
    fn produces_start_at_progress_zero() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut end, 50.0, 50.0, 200.0, 200.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(PathWinding::NonZero);
        sample_path_morph(&mut out, &morph, 0.0);
        assert_eq!(out.data, morph.start_data);
    }

    #[test]
    fn produces_end_at_progress_one() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut end, 50.0, 50.0, 200.0, 200.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(PathWinding::NonZero);
        sample_path_morph(&mut out, &morph, 1.0);
        assert_eq!(out.data, morph.end_data);
    }

    #[test]
    fn interpolates_at_half() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut end, 100.0, 100.0, 100.0, 100.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(PathWinding::NonZero);
        sample_path_morph(&mut out, &morph, 0.5);
        for i in 0..out.data.len() {
            let expected = morph.start_data[i] + (morph.end_data[i] - morph.start_data[i]) * 0.5;
            assert!((out.data[i] - expected).abs() < 0.001);
        }
    }
}
