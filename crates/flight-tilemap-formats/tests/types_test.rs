use flight_tilemap_formats::*;

mod get_tiled_compression_str {
    use super::*;

    #[test]
    fn returns_gzip() {
        assert_eq!(TiledCompression::Gzip.as_str(), "gzip");
    }
}

mod get_tiled_layer_base {
    use super::*;

    #[test]
    fn returns_base_from_tile_layer() {
        let base = TiledLayerBase {
            class: String::new(),
            id: 1,
            name: "test".to_string(),
            offset_x: 0.0,
            offset_y: 0.0,
            opacity: 1.0,
            parallax_x: 1.0,
            parallax_y: 1.0,
            properties: vec![],
            tint_color: None,
            visible: true,
        };
        let layer = TiledLayer::TileLayer(TiledTileLayerData {
            base: base.clone(),
            data: vec![],
            height: 0,
            width: 0,
        });
        assert_eq!(layer.base().name, "test");
    }
}

mod get_tiled_layer_data_failure_str {
    use super::*;

    #[test]
    fn returns_inflate_failed() {
        assert_eq!(
            TiledLayerDataFailure::InflateFailed.as_str(),
            "inflate-failed"
        );
    }
}

mod get_tiled_layer_type {
    use super::*;

    #[test]
    fn returns_tilelayer() {
        let base = TiledLayerBase {
            class: String::new(),
            id: 1,
            name: String::new(),
            offset_x: 0.0,
            offset_y: 0.0,
            opacity: 1.0,
            parallax_x: 1.0,
            parallax_y: 1.0,
            properties: vec![],
            tint_color: None,
            visible: true,
        };
        let layer = TiledLayer::TileLayer(TiledTileLayerData {
            base,
            data: vec![],
            height: 0,
            width: 0,
        });
        assert_eq!(layer.layer_type(), "tilelayer");
    }
}

mod get_tiled_object_alignment_str {
    use super::*;

    #[test]
    fn returns_center() {
        assert_eq!(TiledObjectAlignment::Center.as_str(), "center");
    }
}

mod get_tiled_orientation_str {
    use super::*;

    #[test]
    fn returns_orthogonal() {
        assert_eq!(TiledOrientation::Orthogonal.as_str(), "orthogonal");
    }
}

mod get_tiled_property_type_str {
    use super::*;

    #[test]
    fn returns_string() {
        assert_eq!(TiledPropertyType::String.as_str(), "string");
    }
}

mod get_tiled_render_order_str {
    use super::*;

    #[test]
    fn returns_right_down() {
        assert_eq!(TiledRenderOrder::RightDown.as_str(), "right-down");
    }
}

mod get_tiled_stagger_axis_str {
    use super::*;

    #[test]
    fn returns_x() {
        assert_eq!(TiledStaggerAxis::X.as_str(), "x");
    }
}

mod get_tiled_stagger_index_str {
    use super::*;

    #[test]
    fn returns_even() {
        assert_eq!(TiledStaggerIndex::Even.as_str(), "even");
    }
}
