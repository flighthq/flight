use flight_path::*;

mod tessellate_stroke_path_test {
    use super::*;

    #[test]
    fn returns_none_for_invalid_style() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = create_stroke_style();
        style.width = -1.0;
        let result = tessellate_stroke_path(&path, &style, 0.25);
        assert!(result.is_none());
    }

    #[test]
    fn returns_some_for_valid_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = create_stroke_style();
        let result = tessellate_stroke_path(&path, &style, 0.25);
        assert!(result.is_some());
        let mesh = result.unwrap();
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    #[test]
    fn returns_none_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let style = create_stroke_style();
        let result = tessellate_stroke_path(&path, &style, 0.25);
        assert!(result.is_none());
    }
}
