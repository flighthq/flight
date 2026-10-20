use flight_geometry::Matrix;
use flight_path::*;

mod transform_path_test {
    use super::*;

    #[test]
    fn identity_matrix_leaves_all_coordinates_unchanged() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 10.0, 20.0);
        append_path_line_to(&mut source, 30.0, 40.0);
        let identity = Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 0.0, ty: 0.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &identity, &mut out);
        assert_eq!(out.data, vec![10.0, 20.0, 30.0, 40.0]);
    }

    #[test]
    fn applies_translation_to_move_and_line_points() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        let matrix = Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 5.0, ty: 3.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &matrix, &mut out);
        assert_eq!(out.data, vec![5.0, 3.0, 15.0, 3.0]);
    }

    #[test]
    fn applies_scale_to_quadratic_curve_control_and_anchor_points() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut source, 10.0, 20.0, 30.0, 0.0);
        let matrix = Matrix { a: 2.0, b: 0.0, c: 0.0, d: 2.0, tx: 0.0, ty: 0.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &matrix, &mut out);
        assert_eq!(out.data, vec![0.0, 0.0, 20.0, 40.0, 60.0, 0.0]);
    }

    #[test]
    fn applies_scale_to_cubic_curve_points() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_cubic_curve_to(&mut source, 10.0, 0.0, 20.0, 0.0, 30.0, 0.0);
        let matrix = Matrix { a: 3.0, b: 0.0, c: 0.0, d: 3.0, tx: 0.0, ty: 0.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &matrix, &mut out);
        assert_eq!(out.data, vec![0.0, 0.0, 30.0, 0.0, 60.0, 0.0, 90.0, 0.0]);
    }

    #[test]
    fn is_alias_safe_when_out_is_same_as_source() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 5.0, 10.0);
        append_path_line_to(&mut path, 15.0, 20.0);
        let matrix = Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 100.0, ty: 200.0 };
        transform_path(&path.clone(), &matrix, &mut path);
        assert_eq!(path.data, vec![105.0, 210.0, 115.0, 220.0]);
    }

    #[test]
    fn copies_winding_and_commands_from_source() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 1.0, 1.0);
        let identity = Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 0.0, ty: 0.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &identity, &mut out);
        assert_eq!(out.winding, PathWinding::EvenOdd);
        assert_eq!(out.commands, source.commands);
    }

    #[test]
    fn applies_scale() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 10.0, 20.0);
        let matrix = Matrix { a: 2.0, b: 0.0, c: 0.0, d: 3.0, tx: 0.0, ty: 0.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &matrix, &mut out);
        assert!((out.data[0] - 20.0).abs() < 0.01);
        assert!((out.data[1] - 60.0).abs() < 0.01);
    }
}

mod translate_path_test {
    use super::*;

    #[test]
    fn shifts_all_points_by_dx_dy() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        let mut out = create_path(PathWinding::NonZero);
        translate_path(&source, 5.0, -3.0, &mut out);
        assert_eq!(out.data, vec![5.0, -3.0, 15.0, 7.0]);
    }

    #[test]
    fn is_alias_safe() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 1.0, 2.0);
        translate_path(&path.clone(), 10.0, 20.0, &mut path);
        assert_eq!(path.data, vec![11.0, 22.0]);
    }
}
