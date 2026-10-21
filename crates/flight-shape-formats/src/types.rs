use std::sync::Arc;

use flight_entity::{Kind, Ref};
use flight_texture::contract::Texture;

/// Positional validation types shared by every retained-shape command codec (TS
/// `ShapeCommandSchemaArgumentType`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeCommandSchemaArgumentType {
    Boolean,
    MatrixOrNull,
    Number,
    Numbers,
    NumbersOrNull,
    String,
    Texture,
}

/// One named positional argument in a retained-shape command schema (TS
/// `ShapeCommandSchemaArgument`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShapeCommandSchemaArgument {
    pub name: String,
    pub r#type: ShapeCommandSchemaArgumentType,
}

/// Runtime metadata for one retained-shape command (TS `ShapeCommandSchema`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShapeCommandSchema {
    pub arguments: Vec<ShapeCommandSchemaArgument>,
    pub key: Kind,
    pub required_argument_count: usize,
}

/// The scalar `number | string` carrier accepted by `JSON.stringify` for indentation.
// flight-lint: allow(f64) D1: JSON.stringify space is a JavaScript number and applies JS integer coercion before clamping
#[derive(Clone, Debug, PartialEq)]
pub enum ShapeJsonFormatSpace {
    Number(f64),
    String(String),
}

/// Native shape JSON writer options (TS `ShapeJsonFormatOptions`).
#[derive(Clone, Debug, PartialEq)]
pub struct ShapeJsonFormatOptions {
    pub space: Option<ShapeJsonFormatSpace>,
}

// flight-lint: allow(f64) D1: the source passes the JSON numeric texture ordinal unchanged to the resolver
/// The command-order ordinal persisted in place of a live texture (TS `ShapeTextureReference`).
#[derive(Clone, Debug, PartialEq)]
pub struct ShapeTextureReference {
    pub index: f64,
}

/// Native shape JSON reader options (TS `ShapeJsonParseOptions`).
#[derive(Clone)]
pub struct ShapeJsonParseOptions {
    pub resolve_texture:
        Option<Arc<dyn Fn(&ShapeTextureReference) -> Option<Ref<Texture>> + Send + Sync>>,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ShapeCommandSchemaArgumentType string union
pub fn get_shape_command_schema_argument_type_string(
    value: ShapeCommandSchemaArgumentType,
) -> &'static str {
    return match value {
        ShapeCommandSchemaArgumentType::Boolean => "boolean",
        ShapeCommandSchemaArgumentType::MatrixOrNull => "matrixOrNull",
        ShapeCommandSchemaArgumentType::Number => "number",
        ShapeCommandSchemaArgumentType::Numbers => "numbers",
        ShapeCommandSchemaArgumentType::NumbersOrNull => "numbersOrNull",
        ShapeCommandSchemaArgumentType::String => "string",
        ShapeCommandSchemaArgumentType::Texture => "texture",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ShapeCommandSchemaArgumentType string union
pub fn parse_shape_command_schema_argument_type(
    value: &str,
) -> Option<ShapeCommandSchemaArgumentType> {
    return match value {
        "boolean" => Some(ShapeCommandSchemaArgumentType::Boolean),
        "matrixOrNull" => Some(ShapeCommandSchemaArgumentType::MatrixOrNull),
        "number" => Some(ShapeCommandSchemaArgumentType::Number),
        "numbers" => Some(ShapeCommandSchemaArgumentType::Numbers),
        "numbersOrNull" => Some(ShapeCommandSchemaArgumentType::NumbersOrNull),
        "string" => Some(ShapeCommandSchemaArgumentType::String),
        "texture" => Some(ShapeCommandSchemaArgumentType::Texture),
        _ => None,
    };
}
