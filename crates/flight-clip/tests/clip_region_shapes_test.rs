//! flight-compiler: string-union PathWinding
//! flight-compiler: nullable-options

use flight_geometry::create_rectangle;
use flight_path::{PathWinding, append_path_line_to, append_path_move_to, create_path};

use super::*;

mod create_clip_region_from_circle {
    use super::*;

    #[test]
    fn preserves_circle_bounds() {
        let clip = create_clip_region_from_circle(5.0, 6.0, 2.0, None);
        assert_eq!(
            clip.read().unwrap().rect,
            create_rectangle(3.0, 4.0, 4.0, 4.0)
        );
    }
}

mod create_clip_region_from_ellipse {
    use super::*;

    #[test]
    fn preserves_ellipse_bounds() {
        let rectangle = create_rectangle(1.0, 2.0, 6.0, 4.0);
        let clip = create_clip_region_from_ellipse(&rectangle, None);
        assert_eq!(clip.read().unwrap().rect, rectangle);
    }
}

mod create_clip_region_from_path {
    use super::*;

    #[test]
    fn preserves_path_winding() {
        let mut path = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 2.0, 0.0);
        append_path_line_to(&mut path, 1.0, 2.0);
        let clip = create_clip_region_from_path(&path, None);
        assert_eq!(clip.read().unwrap().winding, PathWinding::EvenOdd);
    }
}

mod create_clip_region_from_rounded_rectangle {
    use super::*;

    #[test]
    fn uses_rect_form_for_zero_radius() {
        let clip = create_clip_region_from_rounded_rectangle(
            &create_rectangle(1.0, 2.0, 3.0, 4.0),
            0.0,
            None,
        );
        assert_eq!(clip.read().unwrap().contours, None);
    }
}

mod initialize_clip_region_from_path {
    use super::*;

    #[test]
    fn initializes_existing_storage() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 2.0, 0.0);
        append_path_line_to(&mut path, 1.0, 2.0);
        let clip = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 0.0, 0.0));
        initialize_clip_region_from_path(&mut clip.write().unwrap(), &path, None);
        assert_eq!(
            clip.read().unwrap().rect,
            create_rectangle(0.0, 0.0, 2.0, 2.0)
        );
    }
}
