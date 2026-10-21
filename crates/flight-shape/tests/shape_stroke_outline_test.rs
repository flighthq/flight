use flight_shape::contract::*;

use crate::support::*;

mod get_shape_stroke_outline_regions {
    use super::*;

    #[test]
    fn returns_none_for_a_non_solid_stroke() {
        let commands = stream(&[("lineTextureStyle", vec![null_token()])]);
        assert!(get_shape_stroke_outline_regions(&commands).is_none());
    }

    #[test]
    fn returns_no_outline_for_an_empty_stream() {
        let regions = get_shape_stroke_outline_regions(&[]).expect("solid");
        assert!(regions.is_empty());
    }
}
