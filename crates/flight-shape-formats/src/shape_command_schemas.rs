use std::collections::HashMap;
use std::sync::LazyLock;

use flight_registry::contract::{KindMap, with_kind_map_entry};

use crate::types::{
    ShapeCommandSchema, ShapeCommandSchemaArgument, ShapeCommandSchemaArgumentType,
};

/// The one immutable runtime schema table for the built-in retained-shape vocabulary (TS
/// `defaultShapeCommandSchemas`). Callers extend schemas in their own `KindMap` values.
pub static DEFAULT_SHAPE_COMMAND_SCHEMAS: LazyLock<KindMap<ShapeCommandSchema>> =
    LazyLock::new(create_default_shape_command_schemas);

fn create_default_shape_command_schemas() -> KindMap<ShapeCommandSchema> {
    let gradient_arguments = vec![
        argument("gradientType", ShapeCommandSchemaArgumentType::String),
        argument("colors", ShapeCommandSchemaArgumentType::Numbers),
        argument("alphas", ShapeCommandSchemaArgumentType::Numbers),
        argument("ratios", ShapeCommandSchemaArgumentType::Numbers),
        argument("matrix", ShapeCommandSchemaArgumentType::MatrixOrNull),
        argument("spreadMethod", ShapeCommandSchemaArgumentType::String),
        argument(
            "interpolationMethod",
            ShapeCommandSchemaArgumentType::String,
        ),
        argument("focalPointRatio", ShapeCommandSchemaArgumentType::Number),
    ];
    let texture_arguments = vec![
        argument("texture", ShapeCommandSchemaArgumentType::Texture),
        argument("matrix", ShapeCommandSchemaArgumentType::MatrixOrNull),
    ];
    let schemas = vec![
        definition("beginTextureFill", 1, texture_arguments.clone()),
        definition(
            "beginFill",
            0,
            vec![
                argument("color", ShapeCommandSchemaArgumentType::Number),
                argument("alpha", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition("beginGradientFill", 4, gradient_arguments.clone()),
        definition(
            "cubicCurveTo",
            6,
            vec![
                argument("controlX1", ShapeCommandSchemaArgumentType::Number),
                argument("controlY1", ShapeCommandSchemaArgumentType::Number),
                argument("controlX2", ShapeCommandSchemaArgumentType::Number),
                argument("controlY2", ShapeCommandSchemaArgumentType::Number),
                argument("x", ShapeCommandSchemaArgumentType::Number),
                argument("y", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "quadraticCurveTo",
            4,
            vec![
                argument("controlX", ShapeCommandSchemaArgumentType::Number),
                argument("controlY", ShapeCommandSchemaArgumentType::Number),
                argument("x", ShapeCommandSchemaArgumentType::Number),
                argument("y", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "drawCircle",
            3,
            vec![
                argument("centerX", ShapeCommandSchemaArgumentType::Number),
                argument("centerY", ShapeCommandSchemaArgumentType::Number),
                argument("radius", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "drawEllipse",
            4,
            vec![
                argument("centerX", ShapeCommandSchemaArgumentType::Number),
                argument("centerY", ShapeCommandSchemaArgumentType::Number),
                argument("radiusX", ShapeCommandSchemaArgumentType::Number),
                argument("radiusY", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "drawPath",
            2,
            vec![
                argument("commands", ShapeCommandSchemaArgumentType::Numbers),
                argument("data", ShapeCommandSchemaArgumentType::Numbers),
                argument("winding", ShapeCommandSchemaArgumentType::String),
            ],
        ),
        definition(
            "drawRectangle",
            4,
            vec![
                argument("x", ShapeCommandSchemaArgumentType::Number),
                argument("y", ShapeCommandSchemaArgumentType::Number),
                argument("width", ShapeCommandSchemaArgumentType::Number),
                argument("height", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "drawRoundedRectangle",
            5,
            vec![
                argument("x", ShapeCommandSchemaArgumentType::Number),
                argument("y", ShapeCommandSchemaArgumentType::Number),
                argument("width", ShapeCommandSchemaArgumentType::Number),
                argument("height", ShapeCommandSchemaArgumentType::Number),
                argument("radius", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "drawTriangles",
            1,
            vec![
                argument("vertices", ShapeCommandSchemaArgumentType::Numbers),
                argument("indices", ShapeCommandSchemaArgumentType::NumbersOrNull),
                argument("uvtData", ShapeCommandSchemaArgumentType::NumbersOrNull),
                argument("culling", ShapeCommandSchemaArgumentType::String),
            ],
        ),
        definition("endFill", 0, Vec::new()),
        definition("lineTextureStyle", 1, texture_arguments),
        definition("lineGradientStyle", 4, gradient_arguments),
        definition(
            "lineStyle",
            0,
            vec![
                argument("thickness", ShapeCommandSchemaArgumentType::Number),
                argument("color", ShapeCommandSchemaArgumentType::Number),
                argument("alpha", ShapeCommandSchemaArgumentType::Number),
                argument("pixelHinting", ShapeCommandSchemaArgumentType::Boolean),
                argument("scaleMode", ShapeCommandSchemaArgumentType::String),
                argument("caps", ShapeCommandSchemaArgumentType::String),
                argument("joints", ShapeCommandSchemaArgumentType::String),
                argument("miterLimit", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "lineTo",
            2,
            vec![
                argument("x", ShapeCommandSchemaArgumentType::Number),
                argument("y", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
        definition(
            "moveTo",
            2,
            vec![
                argument("x", ShapeCommandSchemaArgumentType::Number),
                argument("y", ShapeCommandSchemaArgumentType::Number),
            ],
        ),
    ];
    let mut table = KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
    for schema in schemas {
        table = with_kind_map_entry(&table, schema.key.clone(), schema);
    }
    return table;
}

fn argument(name: &str, r#type: ShapeCommandSchemaArgumentType) -> ShapeCommandSchemaArgument {
    return ShapeCommandSchemaArgument {
        name: name.to_string(),
        r#type,
    };
}

fn definition(
    key: &str,
    required_argument_count: usize,
    arguments: Vec<ShapeCommandSchemaArgument>,
) -> ShapeCommandSchema {
    return ShapeCommandSchema {
        arguments,
        key: key.to_string(),
        required_argument_count,
    };
}
