use std::sync::Arc;

use flight_shape::contract::*;

mod map_scale9_shape_commands {
    use super::*;

    #[test]
    fn maps_coordinates_through_the_mapper() {
        let source = vec![
            ShapeCommandToken::String(String::from("moveTo")),
            ShapeCommandToken::Number(2.0),
            ShapeCommandToken::Number(3.0),
            ShapeCommandToken::Number(7.0),
        ];
        let mapper = ShapeScale9Mapper {
            map_x: Arc::new(|value: f32| value + 1.0),
            map_y: Arc::new(|value: f32| value * 2.0),
        };
        let mut out = Vec::new();
        map_scale9_shape_commands(&mut out, &source, &mapper);
        assert_eq!(out.len(), source.len());
    }
}
