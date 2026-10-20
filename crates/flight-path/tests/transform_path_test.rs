use flight_geometry::Matrix;
use flight_path::*;

mod transform_path_test {
    use super::*;

    #[test]
    fn applies_translation() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 10.0, 20.0);
        let matrix = Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 5.0, ty: 10.0 };
        let mut out = create_path(PathWinding::NonZero);
        transform_path(&source, &matrix, &mut out);
        assert!((out.data[0] - 15.0).abs() < 0.01);
        assert!((out.data[1] - 30.0).abs() < 0.01);
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
    fn translates_all_points() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        translate_path(&source, 10.0, 20.0, &mut out);
        assert!((out.data[0] - 10.0).abs() < 0.01);
        assert!((out.data[1] - 20.0).abs() < 0.01);
        assert!((out.data[2] - 110.0).abs() < 0.01);
        assert!((out.data[3] - 20.0).abs() < 0.01);
    }
}
