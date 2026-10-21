use flight_shape::contract::*;

use crate::support::*;

mod get_shape_stroke_regions {
    use super::*;

    #[test]
    fn resolves_a_solid_stroke_span() {
        let commands = stream(&[
            (
                "lineStyle",
                vec![
                    number(2.0),
                    number(0x112233ffu32 as f64),
                    number(1.0),
                    string("normal"),
                    string("round"),
                    string("miter"),
                    number(4.0),
                ],
            ),
            ("moveTo", vec![number(0.0), number(0.0)]),
            ("lineTo", vec![number(4.0), number(0.0)]),
        ]);
        let regions = get_shape_stroke_regions(&commands).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].style.width, 2.0);
    }
}

mod has_non_solid_shape_stroke {
    use super::*;

    #[test]
    fn detects_texture_line_styles() {
        let commands = stream(&[("lineTextureStyle", vec![null_token()])]);
        assert!(has_non_solid_shape_stroke(&commands));
        assert!(!has_non_solid_shape_stroke(&stream(&[(
            "lineStyle",
            vec![number(1.0)]
        )])));
    }
}
