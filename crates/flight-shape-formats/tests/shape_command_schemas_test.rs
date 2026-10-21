use std::collections::HashMap;

use flight_registry::contract::{KindMap, with_kind_map_entry};
use flight_shape_formats::contract::*;

mod default_shape_command_schemas {
    use super::*;

    fn argument_names(key: &str) -> Vec<String> {
        return DEFAULT_SHAPE_COMMAND_SCHEMAS
            .entries
            .get(key)
            .unwrap()
            .arguments
            .iter()
            .map(|argument| argument.name.clone())
            .collect();
    }

    #[test]
    fn carries_positional_validation_types_and_required_arity_in_the_same_runtime_entry() {
        let schema = DEFAULT_SHAPE_COMMAND_SCHEMAS
            .entries
            .get("drawTriangles")
            .unwrap();
        assert_eq!(schema.key, "drawTriangles");
        assert_eq!(schema.required_argument_count, 1);
        assert_eq!(
            schema.arguments,
            vec![
                ShapeCommandSchemaArgument {
                    name: "vertices".to_string(),
                    r#type: ShapeCommandSchemaArgumentType::Numbers,
                },
                ShapeCommandSchemaArgument {
                    name: "indices".to_string(),
                    r#type: ShapeCommandSchemaArgumentType::NumbersOrNull,
                },
                ShapeCommandSchemaArgument {
                    name: "uvtData".to_string(),
                    r#type: ShapeCommandSchemaArgumentType::NumbersOrNull,
                },
                ShapeCommandSchemaArgument {
                    name: "culling".to_string(),
                    r#type: ShapeCommandSchemaArgumentType::String,
                },
            ]
        );
        assert_eq!(DEFAULT_SHAPE_COMMAND_SCHEMAS.key_order.len(), 17);
        assert_eq!(
            DEFAULT_SHAPE_COMMAND_SCHEMAS.key_order,
            vec![
                "beginTextureFill",
                "beginFill",
                "beginGradientFill",
                "cubicCurveTo",
                "quadraticCurveTo",
                "drawCircle",
                "drawEllipse",
                "drawPath",
                "drawRectangle",
                "drawRoundedRectangle",
                "drawTriangles",
                "endFill",
                "lineTextureStyle",
                "lineGradientStyle",
                "lineStyle",
                "lineTo",
                "moveTo",
            ]
        );

        let caller_table = KindMap {
            entries: HashMap::new(),
            key_order: Vec::new(),
        };
        let custom = ShapeCommandSchema {
            arguments: vec![ShapeCommandSchemaArgument {
                name: "amount".to_string(),
                r#type: ShapeCommandSchemaArgumentType::Number,
            }],
            key: "customCommand".to_string(),
            required_argument_count: 1,
        };
        let caller_table =
            with_kind_map_entry(&caller_table, "customCommand".to_string(), custom.clone());
        assert_eq!(caller_table.entries.get("customCommand"), Some(&custom));
        assert!(
            !DEFAULT_SHAPE_COMMAND_SCHEMAS
                .entries
                .contains_key("customCommand")
        );
    }

    #[test]
    fn names_circle_and_ellipse_centers_and_uses_no_flash_diameter_vocabulary() {
        assert_eq!(
            argument_names("drawCircle"),
            vec!["centerX", "centerY", "radius"]
        );
        assert_eq!(
            argument_names("drawEllipse"),
            vec!["centerX", "centerY", "radiusX", "radiusY"]
        );
    }

    #[test]
    fn names_the_rounded_rectangle_radius_without_flash_ellipse_width_vocabulary() {
        assert_eq!(
            argument_names("drawRoundedRectangle"),
            vec!["x", "y", "width", "height", "radius"]
        );
    }

    #[test]
    fn pins_the_authored_cubic_curve_argument_names_to_the_shape_command_registry_labels() {
        assert_eq!(
            argument_names("cubicCurveTo"),
            vec!["controlX1", "controlY1", "controlX2", "controlY2", "x", "y"]
        );
    }

    #[test]
    fn pins_the_authored_quadratic_curve_argument_names_to_the_shape_command_registry_labels() {
        assert_eq!(
            argument_names("quadraticCurveTo"),
            vec!["controlX", "controlY", "x", "y"]
        );
    }
}
