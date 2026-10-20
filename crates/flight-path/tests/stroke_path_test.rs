use flight_path::*;

mod stroke_path_test {
    use super::*;

    #[test]
    fn produces_outline_for_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = create_stroke_style();
        let outline = stroke_path(&path, &style, 0.25);
        assert!(!outline.commands.is_empty());
        assert!(outline.commands.contains(&(PathCommand::Close as u8)));
    }

    #[test]
    fn produces_wider_outline_for_larger_width() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style_thin = create_stroke_style();
        style_thin.width = 2.0;
        let thin = stroke_path(&path, &style_thin, 0.25);
        let mut style_thick = create_stroke_style();
        style_thick.width = 20.0;
        let thick = stroke_path(&path, &style_thick, 0.25);
        assert!(thick.data.len() >= thin.data.len());
    }

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let style = create_stroke_style();
        let outline = stroke_path(&path, &style, 0.25);
        assert!(outline.commands.is_empty());
    }
}
