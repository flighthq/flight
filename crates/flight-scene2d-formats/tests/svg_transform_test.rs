use flight_geometry::{Matrix, create_transform2d};
use flight_scene2d::contract::create_display_object;
use flight_scene2d_formats::contract::*;
use flight_xml::{XmlElement, parse_xml_document};

mod apply_svg_transform {
    use super::*;

    #[test]
    fn lands_an_element_transform_on_the_imported_node() {
        let target = create_display_object(None);
        let matrix = parse_svg_transform(Some("translate(5,7)")).expect("transform matrix");
        apply_svg_transform(&mut *target.write().unwrap(), Some(&matrix));
        let target = target.read().unwrap();
        assert_eq!(target.x, 5.0);
        assert_eq!(target.y, 7.0);
    }
}

mod assign_svg_transform {
    use super::*;

    #[test]
    fn lands_a_rotation_as_the_node_rotation_rather_than_as_a_position() {
        let target = create_display_object(None);
        let transform = create_transform2d(0.0, 0.0, 90.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assign_svg_transform(&mut *target.write().unwrap(), &transform);
        let target = target.read().unwrap();
        assert_eq!(target.rotation, 90.0);
        assert_eq!(target.x, 0.0);
        assert_eq!(target.y, 0.0);
    }
}

mod create_svg_view_box_matrix {
    use super::*;

    #[test]
    fn fits_meet_none_and_slice_differently() {
        let viewport = SvgViewport {
            height: 20.0,
            width: 20.0,
            x: 0.0,
            y: 0.0,
        };
        expect_matrix(
            &create_svg_view_box_matrix(&[0.0, 0.0, 10.0, 5.0], &viewport, "xMidYMid meet"),
            &[2.0, 0.0, 0.0, 2.0, 0.0, 5.0],
        );
        expect_matrix(
            &create_svg_view_box_matrix(&[0.0, 0.0, 10.0, 5.0], &viewport, "none"),
            &[2.0, 0.0, 0.0, 4.0, 0.0, 0.0],
        );
        expect_matrix(
            &create_svg_view_box_matrix(&[0.0, 0.0, 10.0, 5.0], &viewport, "xMidYMid slice"),
            &[4.0, 0.0, 0.0, 4.0, -10.0, 0.0],
        );
    }
}

mod create_svg_viewport_matrix {
    use super::*;

    #[test]
    fn scales_a_view_box_down_into_the_declared_width_and_height() {
        let matrix = create_svg_viewport_matrix(
            &element(r#"<svg width="100" height="50" viewBox="0 0 200 100"/>"#),
            None,
        )
        .expect("view-box matrix");
        expect_matrix(&matrix, &[0.5, 0.0, 0.0, 0.5, 0.0, 0.0]);
    }
}

mod multiply_svg_matrices {
    use super::*;

    #[test]
    fn composes_the_second_matrix_under_the_first() {
        let translation = parse_svg_transform(Some("translate(1,2)")).expect("translation");
        let scale = parse_svg_transform(Some("scale(3)")).expect("scale");
        let mut out = parse_svg_transform(Some("matrix(1,0,0,1,0,0)")).expect("identity");
        multiply_svg_matrices(&mut out, &translation, &scale);
        expect_matrix(&out, &[3.0, 0.0, 0.0, 3.0, 1.0, 2.0]);
    }
}

mod parse_svg_transform {
    use super::*;

    #[test]
    fn reads_the_transform_functions_and_answers_none_for_an_absent_attribute() {
        expect_matrix(
            &parse_svg_transform(Some("translate(3,4)")).expect("translation"),
            &[1.0, 0.0, 0.0, 1.0, 3.0, 4.0],
        );
        expect_matrix(
            &parse_svg_transform(Some("scale(2)")).expect("scale"),
            &[2.0, 0.0, 0.0, 2.0, 0.0, 0.0],
        );
        assert!(parse_svg_transform(None).is_none());
    }

    #[test]
    fn reads_an_unknown_function_as_the_identity_which_is_not_the_same_as_absent() {
        expect_matrix(
            &parse_svg_transform(Some("bogus(1)")).expect("identity transform"),
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }
}

fn element(xml: &str) -> XmlElement {
    return parse_xml_document(xml).expect("valid test XML");
}

fn expect_matrix(matrix: &Matrix, expected: &[f32]) {
    assert_eq!(
        [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty,],
        expected
    );
}
